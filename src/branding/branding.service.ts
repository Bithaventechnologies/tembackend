import { Injectable } from "@nestjs/common";
import type { EmailBranding } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundApiException } from "../common/exceptions/api.exceptions";
import type { UpdateBrandingDto } from "./dto/branding.dto";

export interface BrandingSnapshot {
  companyName: string;
  websiteUrl?: string;
  supportEmail?: string;
  phone?: string;
  address?: string;
  primaryColor: string;
  secondaryColor: string;
  footerText?: string;
  socialLinks?: Record<string, string | undefined>;
  logoUrl?: string;
}

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreateDefault(organizationId: string): Promise<EmailBranding> {
    const existing = await this.prisma.emailBranding.findUnique({ where: { organizationId } });
    if (existing) return existing;

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    return this.prisma.emailBranding.create({
      data: {
        organizationId,
        companyName: org?.name ?? "Your Company",
      },
    });
  }

  async update(
    organizationId: string,
    actorId: string,
    dto: UpdateBrandingDto,
  ): Promise<EmailBranding> {
    const branding = await this.getOrCreateDefault(organizationId);

    const snapshot: BrandingSnapshot = {
      companyName: dto.companyName,
      websiteUrl: dto.websiteUrl || undefined,
      supportEmail: dto.supportEmail || undefined,
      phone: dto.phone,
      address: dto.address,
      primaryColor: dto.primaryColor,
      secondaryColor: dto.secondaryColor,
      footerText: dto.footerText,
      socialLinks: dto.socialLinks as unknown as Record<string, string | undefined> | undefined,
      logoUrl: dto.logoAssetId ? await this.resolveLogoUrl(dto.logoAssetId) : undefined,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const version = await tx.emailBrandingVersion.create({
        data: {
          brandingId: branding.id,
          snapshotJson: snapshot as unknown as object,
        },
      });

      return tx.emailBranding.update({
        where: { id: branding.id },
        data: {
          companyName: dto.companyName,
          websiteUrl: dto.websiteUrl || null,
          supportEmail: dto.supportEmail || null,
          phone: dto.phone,
          address: dto.address,
          primaryColor: dto.primaryColor,
          secondaryColor: dto.secondaryColor,
          footerText: dto.footerText,
          socialLinksJson: dto.socialLinks as unknown as object,
          logoAssetId: dto.logoAssetId ?? null,
          currentVersionId: version.id,
        },
      });
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "branding.update",
      resourceType: "EmailBranding",
      resourceId: updated.id,
    });

    return updated;
  }

  private async resolveLogoUrl(logoAssetId: string): Promise<string | undefined> {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id: logoAssetId } });
    if (!asset) throw new NotFoundApiException("Logo file asset");
    return asset.url;
  }

  async getCurrentSnapshot(organizationId: string): Promise<BrandingSnapshot> {
    const branding = await this.getOrCreateDefault(organizationId);
    if (branding.currentVersionId) {
      const version = await this.prisma.emailBrandingVersion.findUnique({
        where: { id: branding.currentVersionId },
      });
      if (version) return version.snapshotJson as unknown as BrandingSnapshot;
    }
    // No version yet (brand-new org) — build snapshot from current row.
    const logoUrl = branding.logoAssetId ? await this.resolveLogoUrl(branding.logoAssetId) : undefined;
    return {
      companyName: branding.companyName,
      websiteUrl: branding.websiteUrl ?? undefined,
      supportEmail: branding.supportEmail ?? undefined,
      phone: branding.phone ?? undefined,
      address: branding.address ?? undefined,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      footerText: branding.footerText ?? undefined,
      socialLinks: (branding.socialLinksJson as Record<string, string | undefined>) ?? undefined,
      logoUrl,
    };
  }
}
