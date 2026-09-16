import { Injectable } from "@nestjs/common";
import type { EmailSignature } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundApiException } from "../common/exceptions/api.exceptions";
import { renderSignatureHtml, renderSignatureText, type SignatureSnapshot } from "./signature-render";
import type { CreateSignatureDto, UpdateSignatureDto } from "../branding/dto/branding.dto";

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string): Promise<EmailSignature[]> {
    return this.prisma.emailSignature.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async getOne(organizationId: string, id: string): Promise<EmailSignature> {
    const sig = await this.prisma.emailSignature.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!sig) throw new NotFoundApiException("Signature");
    return sig;
  }

  async create(organizationId: string, actorId: string, dto: CreateSignatureDto): Promise<EmailSignature> {
    const profileImageUrl = dto.profileImageAssetId
      ? await this.resolveImageUrl(dto.profileImageAssetId)
      : undefined;

    const snapshot: SignatureSnapshot = {
      name: dto.name,
      jobTitle: dto.jobTitle,
      department: dto.department,
      email: dto.email || undefined,
      phone: dto.phone,
      website: dto.website || undefined,
      address: dto.address,
      socialLinks: dto.socialLinks as unknown as Record<string, string | undefined> | undefined,
      profileImageUrl,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.emailSignature.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const signature = await tx.emailSignature.create({
        data: {
          organizationId,
          name: dto.name,
          jobTitle: dto.jobTitle,
          department: dto.department,
          email: dto.email || null,
          phone: dto.phone,
          website: dto.website || null,
          address: dto.address,
          socialLinksJson: dto.socialLinks as unknown as object,
          profileImageAssetId: dto.profileImageAssetId ?? null,
          isDefault: dto.isDefault ?? false,
        },
      });

      const version = await tx.emailSignatureVersion.create({
        data: {
          signatureId: signature.id,
          snapshotJson: snapshot as unknown as object,
          renderedHtml: renderSignatureHtml(snapshot),
        },
      });

      return tx.emailSignature.update({
        where: { id: signature.id },
        data: { currentVersionId: version.id },
      });
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "signature.create",
      resourceType: "EmailSignature",
      resourceId: result.id,
    });

    return result;
  }

  async update(
    organizationId: string,
    actorId: string,
    id: string,
    dto: UpdateSignatureDto,
  ): Promise<EmailSignature> {
    const existing = await this.getOne(organizationId, id);
    const currentSnapshot = await this.getCurrentSnapshotFor(existing);

    const profileImageUrl = dto.profileImageAssetId
      ? await this.resolveImageUrl(dto.profileImageAssetId)
      : dto.profileImageAssetId === null
        ? undefined
        : currentSnapshot.profileImageUrl;

    const merged: SignatureSnapshot = {
      name: dto.name ?? currentSnapshot.name,
      jobTitle: dto.jobTitle ?? currentSnapshot.jobTitle,
      department: dto.department ?? currentSnapshot.department,
      email: dto.email !== undefined ? dto.email || undefined : currentSnapshot.email,
      phone: dto.phone ?? currentSnapshot.phone,
      website: dto.website !== undefined ? dto.website || undefined : currentSnapshot.website,
      address: dto.address ?? currentSnapshot.address,
      socialLinks: (dto.socialLinks as unknown as Record<string, string | undefined> | undefined) ?? currentSnapshot.socialLinks,
      profileImageUrl,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.emailSignature.updateMany({
          where: { organizationId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }

      const version = await tx.emailSignatureVersion.create({
        data: {
          signatureId: id,
          snapshotJson: merged as unknown as object,
          renderedHtml: renderSignatureHtml(merged),
        },
      });

      return tx.emailSignature.update({
        where: { id },
        data: {
          name: merged.name,
          jobTitle: merged.jobTitle,
          department: merged.department,
          email: merged.email ?? null,
          phone: merged.phone,
          website: merged.website ?? null,
          address: merged.address,
          socialLinksJson: merged.socialLinks as unknown as object,
          profileImageAssetId: dto.profileImageAssetId !== undefined ? dto.profileImageAssetId : existing.profileImageAssetId,
          isDefault: dto.isDefault ?? existing.isDefault,
          currentVersionId: version.id,
        },
      });
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: "signature.update",
      resourceType: "EmailSignature",
      resourceId: id,
    });

    return result;
  }

  async softDelete(organizationId: string, actorId: string, id: string): Promise<void> {
    await this.getOne(organizationId, id);
    await this.prisma.emailSignature.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
    await this.audit.log({ organizationId, actorId, action: "signature.delete", resourceType: "EmailSignature", resourceId: id });
  }

  async getCurrentSnapshot(organizationId: string, id: string): Promise<SignatureSnapshot> {
    const sig = await this.getOne(organizationId, id);
    return this.getCurrentSnapshotFor(sig);
  }

  async getCurrentSnapshotFor(sig: EmailSignature): Promise<SignatureSnapshot> {
    if (sig.currentVersionId) {
      const version = await this.prisma.emailSignatureVersion.findUnique({ where: { id: sig.currentVersionId } });
      if (version) return version.snapshotJson as unknown as SignatureSnapshot;
    }
    return { name: sig.name };
  }

  async getRenderedHtmlFor(sig: EmailSignature): Promise<{ html: string; text: string } | undefined> {
    if (!sig.currentVersionId) return undefined;
    const version = await this.prisma.emailSignatureVersion.findUnique({ where: { id: sig.currentVersionId } });
    if (!version) return undefined;
    const snapshot = version.snapshotJson as unknown as SignatureSnapshot;
    return { html: version.renderedHtml, text: renderSignatureText(snapshot) };
  }

  private async resolveImageUrl(assetId: string): Promise<string | undefined> {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundApiException("Profile image file asset");
    return asset.url;
  }
}
