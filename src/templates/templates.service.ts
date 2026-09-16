import { Injectable } from "@nestjs/common";
import type { EmailTemplate, TemplateVersion } from "@prisma/client";
import {
  emailDocumentSchema,
  extractVariableKeys,
  type EmailDocument,
} from "@email-platform/types";
import { renderEmail } from "@email-platform/email";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BrandingService } from "../branding/branding.service";
import { SignaturesService } from "../signatures/signatures.service";
import { ResendEmailService } from "../resend/resend-email.service";
import { BadRequestApiException, NotFoundApiException } from "../common/exceptions/api.exceptions";
import type { CreateTemplateDto, SendTestEmailDto, UpdateTemplateDto } from "./dto/template.dto";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branding: BrandingService,
    private readonly signatures: SignaturesService,
    private readonly resend: ResendEmailService,
    private readonly config: ConfigService,
  ) {}

  private parseBody(body: { blocks: unknown[] }): EmailDocument {
    const result = emailDocumentSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestApiException(
        `Invalid template body: ${result.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
    return result.data;
  }

  async list(organizationId: string, categoryId?: string, status?: string): Promise<EmailTemplate[]> {
    return this.prisma.emailTemplate.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(categoryId ? { categoryId } : {}),
        ...(status ? { status: status as EmailTemplate["status"] } : {}),
      },
      include: { currentVersion: true, category: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getOne(organizationId: string, id: string): Promise<EmailTemplate & { currentVersion: TemplateVersion | null }> {
    const template = await this.prisma.emailTemplate.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { currentVersion: true, variables: true },
    });
    if (!template) throw new NotFoundApiException("Template");
    return template;
  }

  async create(organizationId: string, actorId: string, dto: CreateTemplateDto): Promise<EmailTemplate> {
    const body = this.parseBody(dto.body);
    const rendered = this.compileForStorage(body, dto.subject, dto.previewText);

    const result = await this.prisma.$transaction(async (tx) => {
      const template = await tx.emailTemplate.create({
        data: {
          organizationId,
          categoryId: dto.categoryId,
          name: dto.name,
          classification: dto.classification ?? "TRANSACTIONAL",
          createdById: actorId,
        },
      });

      const version = await tx.templateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          subject: dto.subject,
          previewText: dto.previewText,
          bodyBlocksJson: body as unknown as object,
          bodyHtml: rendered.html,
          bodyText: rendered.text,
        },
      });

      if (dto.variables?.length) {
        await tx.templateVariable.createMany({
          data: dto.variables.map((v) => ({
            templateId: template.id,
            key: v.key,
            label: v.label,
            isRequired: v.isRequired ?? false,
            defaultValue: v.defaultValue,
            source: v.source ?? "RECIPIENT",
          })),
        });
      }

      return tx.emailTemplate.update({
        where: { id: template.id },
        data: { currentVersionId: version.id },
      });
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "template.create",
      resourceType: "EmailTemplate",
      resourceId: result.id,
    });

    return result;
  }

  // Every meaningful content edit (subject/previewText/body/variables)
  // creates a NEW TemplateVersion and repoints currentVersionId — existing
  // versions (and anything referencing them, e.g. Campaign.templateVersionId)
  // are never mutated.
  async update(organizationId: string, actorId: string, id: string, dto: UpdateTemplateDto): Promise<EmailTemplate> {
    const template = await this.getOne(organizationId, id);

    const contentChanged = dto.subject !== undefined || dto.previewText !== undefined || dto.body !== undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      let currentVersionId = template.currentVersionId;

      if (contentChanged) {
        const currentVersion = template.currentVersion;
        const body = dto.body ? this.parseBody(dto.body) : (currentVersion?.bodyBlocksJson as unknown as EmailDocument);
        const subject = dto.subject ?? currentVersion?.subject ?? "";
        const previewText = dto.previewText ?? currentVersion?.previewText ?? undefined;
        const rendered = this.compileForStorage(body, subject, previewText);

        const latestVersionNumber = await tx.templateVersion.aggregate({
          where: { templateId: id },
          _max: { versionNumber: true },
        });
        const nextVersionNumber = (latestVersionNumber._max.versionNumber ?? 0) + 1;

        const newVersion = await tx.templateVersion.create({
          data: {
            templateId: id,
            versionNumber: nextVersionNumber,
            subject,
            previewText,
            bodyBlocksJson: body as unknown as object,
            bodyHtml: rendered.html,
            bodyText: rendered.text,
          },
        });
        currentVersionId = newVersion.id;
      }

      if (dto.variables) {
        await tx.templateVariable.deleteMany({ where: { templateId: id } });
        if (dto.variables.length) {
          await tx.templateVariable.createMany({
            data: dto.variables.map((v) => ({
              templateId: id,
              key: v.key,
              label: v.label,
              isRequired: v.isRequired ?? false,
              defaultValue: v.defaultValue,
              source: v.source ?? "RECIPIENT",
            })),
          });
        }
      }

      return tx.emailTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          categoryId: dto.categoryId,
          classification: dto.classification,
          status: dto.status,
          currentVersionId,
        },
      });
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "template.update",
      resourceType: "EmailTemplate",
      resourceId: id,
      metadata: { contentChanged },
    });

    return result;
  }

  async softDelete(organizationId: string, actorId: string, id: string): Promise<void> {
    await this.getOne(organizationId, id);
    await this.prisma.emailTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ organizationId, actorId, action: "template.delete", resourceType: "EmailTemplate", resourceId: id });
  }

  async listVersions(organizationId: string, id: string): Promise<TemplateVersion[]> {
    await this.getOne(organizationId, id);
    return this.prisma.templateVersion.findMany({ where: { templateId: id }, orderBy: { versionNumber: "desc" } });
  }

  extractVariables(body: { blocks: unknown[] }, subject: string, previewText?: string): string[] {
    const parsed = this.parseBody(body);
    return extractVariableKeys(parsed, subject, previewText);
  }

  // Compiles with a minimal placeholder branding so bodyHtml/bodyText are
  // storable immediately at save time; the real preview/send paths always
  // re-render with live branding+signature via renderEmail() directly.
  private compileForStorage(body: EmailDocument, subject: string, previewText?: string) {
    return renderEmail({
      subject,
      previewText,
      blocks: body.blocks,
      variables: {},
      branding: { companyName: "" , primaryColor: "#111827", secondaryColor: "#6366F1" },
    });
  }

  async preview(
    organizationId: string,
    id: string,
    sampleVariables: Record<string, string>,
  ): Promise<{ subject: string; html: string; text: string; unresolvedVariables: string[]; mjmlErrors: string[] }> {
    const template = await this.getOne(organizationId, id);
    if (!template.currentVersion) throw new BadRequestApiException("Template has no content yet");

    const brandingSnapshot = await this.branding.getCurrentSnapshot(organizationId);
    const defaultSignature = await this.prisma.emailSignature.findFirst({
      where: { organizationId, isDefault: true, deletedAt: null },
    });
    const signatureRendered = defaultSignature ? await this.signatures.getRenderedHtmlFor(defaultSignature) : undefined;

    const body = template.currentVersion.bodyBlocksJson as unknown as EmailDocument;

    return renderEmail({
      subject: template.currentVersion.subject,
      previewText: template.currentVersion.previewText ?? undefined,
      blocks: body.blocks,
      variables: { currentDate: new Date().toLocaleDateString(), companyName: brandingSnapshot.companyName, ...sampleVariables },
      branding: brandingSnapshot,
      signatureHtml: signatureRendered?.html,
      signatureText: signatureRendered?.text,
    });
  }

  async sendTest(
    organizationId: string,
    actorId: string,
    id: string,
    dto: SendTestEmailDto,
  ): Promise<{ providerMessageId: string }> {
    const rendered = await this.preview(organizationId, id, dto.sampleVariables ?? {});

    const fromEmail = this.config.getOrThrow<string>("RESEND_FROM_EMAIL");
    const fromName = this.config.getOrThrow<string>("RESEND_FROM_NAME");

    const result = await this.resend.sendTest({
      to: dto.toEmail,
      fromEmail,
      fromName,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      tags: [{ name: "type", value: "test-send" }],
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "template.send_test",
      resourceType: "EmailTemplate",
      resourceId: id,
      metadata: { toEmail: dto.toEmail },
    });

    return result;
  }
}
