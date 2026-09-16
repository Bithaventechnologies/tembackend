import { Injectable, Inject } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { EmailMessage } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SuppressionService } from "../campaigns/suppression.service";
import { EMAIL_SEND_QUEUE, type EmailSendJobData } from "../queue/queue.constants";
import { BadRequestApiException, NotFoundApiException } from "../common/exceptions/api.exceptions";

@Injectable()
export class FailedEmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly suppression: SuppressionService,
    @InjectQueue(EMAIL_SEND_QUEUE) private readonly emailQueue: Queue<EmailSendJobData>,
  ) {}

  async list(
    organizationId: string,
    page: number,
    limit: number,
    failureType?: string,
    campaignId?: string,
  ): Promise<{ items: EmailMessage[]; total: number }> {
    const where = {
      organizationId,
      status: "FAILED" as const,
      ...(failureType ? { failureType: failureType as EmailMessage["failureType"] } : {}),
      ...(campaignId ? { campaignId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.emailMessage.findMany({ where, orderBy: { failedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return { items, total };
  }

  // Only re-enqueues TRANSIENT (or UNKNOWN, treated as retryable-once)
  // failures — PERMANENT failures are never retried automatically. Re-checks
  // suppression before enqueuing since a bounce/unsubscribe may have arrived
  // since the original failure.
  async retry(organizationId: string, actorId: string, id: string): Promise<{ retried: boolean }> {
    const message = await this.prisma.emailMessage.findFirst({ where: { id, organizationId } });
    if (!message) throw new NotFoundApiException("Failed email");
    if (message.status !== "FAILED") {
      throw new BadRequestApiException("Only messages with status FAILED can be retried");
    }
    if (message.failureType === "PERMANENT") {
      throw new BadRequestApiException("Permanent failures cannot be retried");
    }

    const recipient = await this.prisma.recipient.findUnique({ where: { id: message.recipientId } });
    if (recipient) {
      const suppressed = await this.suppression.isSuppressed(organizationId, recipient.email);
      if (suppressed) {
        await this.prisma.emailMessage.update({ where: { id }, data: { status: "SUPPRESSED" } });
        return { retried: false };
      }
    }

    await this.prisma.emailMessage.update({
      where: { id },
      data: { status: "QUEUED", failureReason: null, failureType: null },
    });

    await this.emailQueue.add(
      "send-email",
      { emailMessageId: id },
      { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: false },
    );

    await this.audit.log({
      organizationId,
      actorId,
      action: "email.retry",
      resourceType: "EmailMessage",
      resourceId: id,
    });

    return { retried: true };
  }
}
