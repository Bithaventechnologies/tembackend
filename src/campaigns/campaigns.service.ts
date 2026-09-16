import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import type { Campaign } from "@prisma/client";
import type { EmailDocument } from "@email-platform/types";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BrandingService } from "../branding/branding.service";
import { SignaturesService } from "../signatures/signatures.service";
import { SuppressionService } from "./suppression.service";
import { EMAIL_SEND_QUEUE, type EmailSendJobData } from "../queue/queue.constants";
import {
  BadRequestApiException,
  ConflictApiException,
  NotFoundApiException,
} from "../common/exceptions/api.exceptions";
import type { CreateCampaignDto, SendCampaignDto } from "./dto/campaign.dto";

interface ResolvedRecipient {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  customFields?: Record<string, string> | null;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branding: BrandingService,
    private readonly signatures: SignaturesService,
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
    @InjectQueue(EMAIL_SEND_QUEUE) private readonly emailQueue: Queue<EmailSendJobData>,
  ) {}

  async list(organizationId: string, status?: string): Promise<Campaign[]> {
    return this.prisma.campaign.findMany({
      where: { organizationId, ...(status ? { status: status as Campaign["status"] } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async getOne(organizationId: string, id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new NotFoundApiException("Campaign");
    return campaign;
  }

  async getDetail(
    organizationId: string,
    id: string,
    statusFilter?: string,
  ): Promise<{
    campaign: Campaign;
    recipients: Array<{
      id: string;
      recipientId: string;
      email: string;
      status: string;
      failureReason: string | null;
      sentAt: Date | null;
      deliveredAt: Date | null;
      openCount: number;
      clickCount: number;
    }>;
    statusCounts: Record<string, number>;
    eventCounts: Record<string, number>;
  }> {
    const campaign = await this.getOne(organizationId, id);
    const campaignRecipients = await this.prisma.campaignRecipient.findMany({
      where: {
        campaignId: id,
        ...(statusFilter ? { emailMessage: { status: statusFilter as never } } : {}),
      },
      include: { recipient: { select: { email: true } }, emailMessage: true },
    });

    const recipients = campaignRecipients.map((cr) => ({
      id: cr.id,
      recipientId: cr.recipientId,
      email: cr.recipient.email,
      status: cr.emailMessage?.status ?? "QUEUED",
      failureReason: cr.emailMessage?.failureReason ?? null,
      sentAt: cr.emailMessage?.sentAt ?? null,
      deliveredAt: cr.emailMessage?.deliveredAt ?? null,
      openCount: cr.emailMessage?.openCount ?? 0,
      clickCount: cr.emailMessage?.clickCount ?? 0,
    }));

    const statusCounts: Record<string, number> = {};
    let opened = 0;
    let clicked = 0;
    for (const r of recipients) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
      if (r.openCount > 0) opened += 1;
      if (r.clickCount > 0) clicked += 1;
    }
    const eventCounts: Record<string, number> = { opened, clicked };

    return { campaign, recipients, statusCounts, eventCounts };
  }

  // Creates a DRAFT campaign: snapshots the template's *current* version,
  // branding's *current* version, and the chosen (or default) signature's
  // *current* version at creation time, then resolves recipients (list
  // and/or manual emails, de-duplicated) and writes one CampaignRecipient
  // per resolved recipient with pre-computed variablesJson. Suppression
  // filtering happens at SEND time (Section: campaigns send), not here —
  // creation just resolves the audience.
  async create(organizationId: string, actorId: string, dto: CreateCampaignDto): Promise<Campaign> {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id: dto.templateId, organizationId, deletedAt: null },
      include: { currentVersion: true },
    });
    if (!template || !template.currentVersion) {
      throw new BadRequestApiException("Template not found or has no published content");
    }

    const brandingRow = await this.branding.getOrCreateDefault(organizationId);
    if (!brandingRow.currentVersionId) {
      // Force a version snapshot to exist before any campaign can be created.
      await this.branding.update(organizationId, actorId, {
        companyName: brandingRow.companyName,
        primaryColor: brandingRow.primaryColor,
        secondaryColor: brandingRow.secondaryColor,
      });
    }
    const refreshedBranding = await this.prisma.emailBranding.findUniqueOrThrow({ where: { organizationId } });

    let signatureVersionId: string | null = null;
    if (dto.signatureId) {
      const sig = await this.prisma.emailSignature.findFirst({
        where: { id: dto.signatureId, organizationId, deletedAt: null },
      });
      if (!sig) throw new BadRequestApiException("Signature not found");
      signatureVersionId = sig.currentVersionId;
    } else {
      const defaultSig = await this.prisma.emailSignature.findFirst({
        where: { organizationId, isDefault: true, deletedAt: null },
      });
      signatureVersionId = defaultSig?.currentVersionId ?? null;
    }

    const resolvedRecipients = await this.resolveRecipients(organizationId, dto.recipientListId, dto.manualRecipientEmails);
    if (resolvedRecipients.length === 0) {
      throw new BadRequestApiException("Campaign must resolve to at least one recipient");
    }

    const body = template.currentVersion.bodyBlocksJson as unknown as EmailDocument;
    const brandingSnapshot = await this.branding.getCurrentSnapshot(organizationId);

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          organizationId,
          name: dto.name,
          templateId: template.id,
          templateVersionId: template.currentVersion!.id,
          recipientListId: dto.recipientListId ?? null,
          brandingSnapshotId: refreshedBranding.currentVersionId,
          signatureSnapshotId: signatureVersionId,
          status: "DRAFT",
          totalRecipients: resolvedRecipients.length,
          createdById: actorId,
        },
      });

      for (const recipient of resolvedRecipients) {
        const variables = this.resolveVariables(recipient, brandingSnapshot.companyName, dto.customVariableOverrides ?? {});
        await tx.campaignRecipient.create({
          data: {
            campaignId: created.id,
            recipientId: recipient.id,
            variablesJson: variables as unknown as object,
          },
        });
      }

      return created;
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "campaign.create",
      resourceType: "Campaign",
      resourceId: campaign.id,
      metadata: { totalRecipients: resolvedRecipients.length },
    });

    return campaign;
  }

  private resolveVariables(
    recipient: ResolvedRecipient,
    companyName: string,
    overrides: Record<string, string>,
  ): Record<string, string> {
    const base: Record<string, string> = {
      firstName: recipient.firstName ?? "",
      lastName: recipient.lastName ?? "",
      company: recipient.company ?? "",
      email: recipient.email,
      companyName,
      currentDate: new Date().toLocaleDateString(),
    };
    if (recipient.customFields) {
      for (const [key, value] of Object.entries(recipient.customFields)) {
        base[key] = value;
      }
    }
    return { ...base, ...overrides };
  }

  private async resolveRecipients(
    organizationId: string,
    recipientListId: string | undefined,
    manualEmails: string[] | undefined,
  ): Promise<ResolvedRecipient[]> {
    const byId = new Map<string, ResolvedRecipient>();

    if (recipientListId) {
      const members = await this.prisma.recipientListMember.findMany({
        where: { recipientListId, recipient: { organizationId, deletedAt: null, status: "ACTIVE" } },
        include: { recipient: true },
      });
      for (const m of members) {
        byId.set(m.recipient.id, {
          id: m.recipient.id,
          email: m.recipient.email,
          firstName: m.recipient.firstName,
          lastName: m.recipient.lastName,
          company: m.recipient.company,
          customFields: m.recipient.customFields as Record<string, string> | null,
        });
      }
    }

    if (manualEmails?.length) {
      const normalized = Array.from(new Set(manualEmails.map((e) => e.toLowerCase())));
      const found = await this.prisma.recipient.findMany({
        where: { organizationId, deletedAt: null, status: "ACTIVE", email: { in: normalized } },
      });
      for (const r of found) {
        byId.set(r.id, {
          id: r.id,
          email: r.email,
          firstName: r.firstName,
          lastName: r.lastName,
          company: r.company,
          customFields: r.customFields as Record<string, string> | null,
        });
      }
    }

    return Array.from(byId.values());
  }

  // Enqueues one BullMQ job per resolved recipient; never sends synchronously.
  // Requires a unique idempotencyKey (enforced by Campaign.idempotencyKey
  // being @unique) so a duplicate "send" click/retry cannot double-enqueue.
  // Anyone in SuppressionEntry is skipped and their EmailMessage is created
  // directly as SUPPRESSED instead of QUEUED.
  async send(organizationId: string, actorId: string, id: string, dto: SendCampaignDto): Promise<Campaign> {
    const campaign = await this.getOne(organizationId, id);

    if (campaign.status !== "DRAFT") {
      throw new ConflictApiException(`Campaign cannot be sent from status ${campaign.status}`);
    }

    const existingByKey = await this.prisma.campaign.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existingByKey && existingByKey.id !== id) {
      throw new ConflictApiException("Idempotency key has already been used for a different campaign");
    }

    const campaignRecipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId: id },
      include: { recipient: true },
    });

    if (dto.confirmedRecipientCount !== campaignRecipients.length) {
      throw new BadRequestApiException(
        `Confirmed recipient count (${dto.confirmedRecipientCount}) does not match current campaign recipient count (${campaignRecipients.length})`,
      );
    }

    const templateVersion = await this.prisma.templateVersion.findUniqueOrThrow({ where: { id: campaign.templateVersionId } });
    const emails = campaignRecipients.map((cr) => cr.recipient.email);
    const suppressed = await this.suppression.getSuppressedSet(organizationId, emails);

    const fromEmail = this.config.getOrThrow<string>("RESEND_FROM_EMAIL");
    const fromName = this.config.getOrThrow<string>("RESEND_FROM_NAME");

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: { status: "QUEUED", idempotencyKey: dto.idempotencyKey, startedAt: new Date() },
      });

      for (const cr of campaignRecipients) {
        const isSuppressed = suppressed.has(cr.recipient.email);
        await tx.emailMessage.create({
          data: {
            organizationId,
            campaignId: id,
            campaignRecipientId: cr.id,
            recipientId: cr.recipientId,
            templateVersionId: templateVersion.id,
            fromEmail,
            fromName,
            subject: templateVersion.subject,
            bodyHtml: templateVersion.bodyHtml,
            bodyText: templateVersion.bodyText,
            status: isSuppressed ? "SUPPRESSED" : "QUEUED",
          },
        });
      }

      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });

    // Enqueue jobs only for non-suppressed messages, outside the DB
    // transaction (queueing must not roll back on a Redis hiccup after the
    // DB commit — the worker's idempotency check via providerMessageId
    // covers any duplicate-enqueue edge cases).
    const messages = await this.prisma.emailMessage.findMany({
      where: { campaignId: id, status: "QUEUED" },
    });

    const concurrency = this.config.get<number>("EMAIL_SEND_CONCURRENCY", 5);
    const ratePerSecond = this.config.get<number>("EMAIL_SEND_RATE_PER_SECOND", 10);
    void concurrency;

    for (const message of messages) {
      await this.emailQueue.add(
        "send-email",
        { emailMessageId: message.id },
        {
          attempts: 5,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: false,
        },
      );
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: "campaign.send",
      resourceType: "Campaign",
      resourceId: id,
      metadata: { enqueued: messages.length, suppressed: suppressed.size, ratePerSecond },
    });

    return updated;
  }

  async cancel(organizationId: string, actorId: string, id: string): Promise<Campaign> {
    const campaign = await this.getOne(organizationId, id);
    if (!["DRAFT", "QUEUED", "SCHEDULED", "SENDING"].includes(campaign.status)) {
      throw new ConflictApiException(`Campaign cannot be cancelled from status ${campaign.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.emailMessage.updateMany({
        where: { campaignId: id, status: { in: ["QUEUED", "PROCESSING"] } },
        data: { status: "CANCELLED" },
      });
      return tx.campaign.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    });

    await this.audit.log({ organizationId, actorId, action: "campaign.cancel", resourceType: "Campaign", resourceId: id });

    return updated;
  }
}
