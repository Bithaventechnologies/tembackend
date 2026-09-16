import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Webhook } from "svix";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SuppressionService } from "../campaigns/suppression.service";
import {
  extractEmailMessageIdTag,
  extractProviderMessageId,
  mapResendEventType,
  type ResendWebhookPayload,
} from "./resend-event-mapper";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly suppression: SuppressionService,
  ) {
    this.webhookSecret = this.config.getOrThrow<string>("RESEND_WEBHOOK_SECRET");
  }

  // Verifies against the RAW request body (must not have been JSON-parsed
  // already) using svix's Webhook.verify, matching Resend's svix-based
  // webhook signing. Throws UnauthorizedException on a bad/missing signature.
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ResendWebhookPayload {
    const wh = new Webhook(this.webhookSecret);
    const svixHeaders: Record<string, string> = {
      "svix-id": this.headerToString(headers["svix-id"]),
      "svix-timestamp": this.headerToString(headers["svix-timestamp"]),
      "svix-signature": this.headerToString(headers["svix-signature"]),
    };

    try {
      return wh.verify(rawBody, svixHeaders) as unknown as ResendWebhookPayload;
    } catch (error) {
      this.logger.warn(`Webhook signature verification failed: ${String(error)}`);
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }

  private headerToString(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
  }

  async handleEvent(payload: ResendWebhookPayload): Promise<void> {
    const eventType = mapResendEventType(payload.type);
    if (!eventType) {
      this.logger.log(`Ignoring unrecognized Resend event type: ${payload.type}`);
      return;
    }

    const providerMessageId = extractProviderMessageId(payload);
    const taggedEmailMessageId = extractEmailMessageIdTag(payload);

    const emailMessage = providerMessageId
      ? await this.prisma.emailMessage.findUnique({ where: { providerMessageId } })
      : taggedEmailMessageId
        ? await this.prisma.emailMessage.findUnique({ where: { id: taggedEmailMessageId } })
        : null;

    if (!emailMessage) {
      this.logger.warn(`Webhook event ${payload.type} did not match any EmailMessage (providerMessageId=${providerMessageId ?? "none"})`);
      return;
    }

    // Idempotent upsert keyed by providerEventId (unique). We don't get a
    // stable event id field name confirmed from Resend docs at time of
    // writing, so we synthesize one from type+email_id+created_at as a
    // fallback when Resend doesn't send an explicit id — see ASSUMPTION
    // comment in resend-event-mapper.ts.
    const providerEventId = this.deriveEventId(payload);
    const timestamp = payload.created_at ? new Date(payload.created_at) : new Date();

    try {
      await this.prisma.emailEvent.create({
        data: {
          emailMessageId: emailMessage.id,
          eventType,
          providerEventId,
          timestamp,
          metadataJson: payload.data as unknown as object,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Unique constraint on providerEventId — duplicate delivery, already processed.
        this.logger.log(`Duplicate webhook event ${providerEventId}; skipping (idempotent)`);
        return;
      }
      throw error;
    }

    await this.applyStatusUpdate(emailMessage.id, eventType);

    if (eventType === "BOUNCED") {
      await this.suppression.add(emailMessage.organizationId, this.recipientEmailFromPayload(payload) ?? "", "HARD_BOUNCE", payload.type, emailMessage.recipientId);
    }
    if (eventType === "COMPLAINED") {
      await this.suppression.add(emailMessage.organizationId, this.recipientEmailFromPayload(payload) ?? "", "COMPLAINT", payload.type, emailMessage.recipientId);
    }
  }

  private recipientEmailFromPayload(payload: ResendWebhookPayload): string | undefined {
    const to = payload.data.to;
    if (Array.isArray(to)) return to[0];
    return to;
  }

  private deriveEventId(payload: ResendWebhookPayload): string {
    const explicit = (payload.data as Record<string, unknown>).event_id;
    if (typeof explicit === "string") return explicit;
    const providerMessageId = extractProviderMessageId(payload) ?? "unknown";
    return `${payload.type}:${providerMessageId}:${payload.created_at ?? ""}`;
  }

  private async applyStatusUpdate(emailMessageId: string, eventType: string): Promise<void> {
    const now = new Date();
    switch (eventType) {
      case "DELIVERED":
        await this.prisma.emailMessage.update({ where: { id: emailMessageId }, data: { status: "DELIVERED", deliveredAt: now } });
        break;
      case "BOUNCED":
        await this.prisma.emailMessage.update({ where: { id: emailMessageId }, data: { status: "BOUNCED", bouncedAt: now } });
        break;
      case "FAILED":
        await this.prisma.emailMessage.update({ where: { id: emailMessageId }, data: { status: "FAILED", failedAt: now } });
        break;
      case "OPENED": {
        const existing = await this.prisma.emailMessage.findUnique({ where: { id: emailMessageId } });
        await this.prisma.emailMessage.update({
          where: { id: emailMessageId },
          data: {
            status: "OPENED",
            firstOpenedAt: existing?.firstOpenedAt ?? now,
            lastOpenedAt: now,
            openCount: { increment: 1 },
          },
        });
        break;
      }
      case "CLICKED": {
        const existing = await this.prisma.emailMessage.findUnique({ where: { id: emailMessageId } });
        await this.prisma.emailMessage.update({
          where: { id: emailMessageId },
          data: {
            status: "CLICKED",
            firstClickedAt: existing?.firstClickedAt ?? now,
            lastClickedAt: now,
            clickCount: { increment: 1 },
          },
        });
        break;
      }
      default:
        break;
    }
  }
}
