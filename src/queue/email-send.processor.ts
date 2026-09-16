import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { ResendEmailService } from "../resend/resend-email.service";
import { SendEmailError } from "../resend/resend.types";
import { SuppressionService } from "../campaigns/suppression.service";
import { EMAIL_SEND_QUEUE, type EmailSendJobData } from "./queue.constants";

// One BullMQ job per recipient (Section: Queue/Worker). Concurrency and
// per-second rate are applied via the @Processor decorator options below,
// sourced from EMAIL_SEND_CONCURRENCY / EMAIL_SEND_RATE_PER_SECOND.
@Processor(EMAIL_SEND_QUEUE, {
  concurrency: Number(process.env.EMAIL_SEND_CONCURRENCY ?? 5),
  limiter: {
    max: Number(process.env.EMAIL_SEND_RATE_PER_SECOND ?? 10),
    duration: 1000,
  },
})
export class EmailSendProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resend: ResendEmailService,
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<EmailSendJobData>): Promise<void> {
    const { emailMessageId } = job.data;

    const message = await this.prisma.emailMessage.findUnique({ where: { id: emailMessageId } });
    if (!message) {
      this.logger.warn(`EmailMessage ${emailMessageId} no longer exists; skipping job ${job.id}`);
      return;
    }

    // Idempotency: already has a providerMessageId (or terminal status) —
    // do not send again, even if this job is a duplicate/retry.
    if (message.providerMessageId || ["SENT", "DELIVERED", "CANCELLED", "SUPPRESSED"].includes(message.status)) {
      this.logger.log(`EmailMessage ${emailMessageId} already handled (status=${message.status}); skipping`);
      return;
    }

    if (message.status === "CANCELLED") return;

    const recipient = await this.prisma.recipient.findUnique({ where: { id: message.recipientId } });
    if (!recipient) {
      await this.markPermanentFailure(emailMessageId, "Recipient no longer exists");
      return;
    }

    // Re-check suppression at send time in case a bounce/complaint/unsubscribe
    // landed between campaign creation and this job actually running.
    const isSuppressed = await this.suppression.isSuppressed(message.organizationId, recipient.email);
    if (isSuppressed) {
      await this.prisma.emailMessage.update({
        where: { id: emailMessageId },
        data: { status: "SUPPRESSED" },
      });
      return;
    }

    await this.prisma.emailMessage.update({ where: { id: emailMessageId }, data: { status: "PROCESSING" } });

    try {
      const result = await this.resend.send({
        to: recipient.email,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        replyTo: message.replyTo ?? undefined,
        subject: message.subject,
        html: message.bodyHtml,
        text: message.bodyText,
        tags: [{ name: "email_message_id", value: message.id }],
      });

      await this.prisma.emailMessage.update({
        where: { id: emailMessageId },
        data: {
          status: "SENT",
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
      if (message.campaignId) await this.maybeCompleteCampaign(message.campaignId);
    } catch (error) {
      if (error instanceof SendEmailError && error.classification === "PERMANENT") {
        await this.markPermanentFailure(emailMessageId, error.message, "PERMANENT");
        if (message.campaignId) await this.maybeCompleteCampaign(message.campaignId);
        // Do not rethrow — a PERMANENT failure must not be retried by BullMQ.
        return;
      }

      const classification = error instanceof SendEmailError ? error.classification : "UNKNOWN";
      await this.prisma.emailMessage.update({
        where: { id: emailMessageId },
        data: {
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : "Unknown send error",
          failureType: classification,
          retryCount: { increment: 1 },
          failedAt: new Date(),
        },
      });

      // Rethrow so BullMQ applies the configured retry/backoff for
      // TRANSIENT/UNKNOWN failures. PERMANENT failures returned above instead.
      throw error;
    }
  }

  // Marks the parent Campaign COMPLETED (or PARTIALLY_FAILED if any message
  // ended up FAILED/BOUNCED) once every one of its EmailMessages has left the
  // in-flight QUEUED/PROCESSING states. Called after every terminal outcome
  // rather than tracked via a counter, since concurrent workers make a
  // shared counter race-prone — this recheck is cheap and idempotent.
  private async maybeCompleteCampaign(campaignId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status === "COMPLETED" || campaign.status === "PARTIALLY_FAILED") return;

    const inFlight = await this.prisma.emailMessage.count({
      where: { campaignId, status: { in: ["QUEUED", "PROCESSING"] } },
    });
    if (inFlight > 0) return;

    const failedCount = await this.prisma.emailMessage.count({
      where: { campaignId, status: { in: ["FAILED", "BOUNCED"] } },
    });

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: failedCount > 0 ? "PARTIALLY_FAILED" : "COMPLETED",
        completedAt: new Date(),
      },
    });
  }

  private async markPermanentFailure(
    emailMessageId: string,
    reason: string,
    failureType: "TRANSIENT" | "PERMANENT" | "UNKNOWN" = "PERMANENT",
  ): Promise<void> {
    await this.prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        status: "FAILED",
        failureReason: reason,
        failureType,
        failedAt: new Date(),
      },
    });
  }
}
