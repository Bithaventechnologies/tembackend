import { Injectable } from "@nestjs/common";
import type { Recipient, RecipientList } from "@prisma/client";
import { stringify } from "csv-stringify/sync";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.service";
import { Inject } from "@nestjs/common";
import { BadRequestApiException, NotFoundApiException } from "../common/exceptions/api.exceptions";
import { parseCsvBuffer, validateCsvRows } from "./csv-import.util";
import type { CsvImportSummary } from "@email-platform/types";
import type {
  CreateRecipientDto,
  CreateRecipientListDto,
  ImportRecipientsDto,
  UpdateRecipientDto,
} from "./dto/recipient.dto";

const FIELD_MAP: Record<string, keyof CreateRecipientDto> = {
  email: "email",
  firstName: "firstName",
  lastName: "lastName",
  company: "company",
  phone: "phone",
};

@Injectable()
export class RecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(
    organizationId: string,
    page: number,
    limit: number,
    search?: string,
    status?: string,
  ): Promise<{ items: Recipient[]; total: number }> {
    const where = {
      organizationId,
      deletedAt: null,
      ...(status ? { status: status as Recipient["status"] } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.recipient.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.recipient.count({ where }),
    ]);

    return { items, total };
  }

  async getOne(organizationId: string, id: string): Promise<Recipient> {
    const recipient = await this.prisma.recipient.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!recipient) throw new NotFoundApiException("Recipient");
    return recipient;
  }

  async create(organizationId: string, dto: CreateRecipientDto): Promise<Recipient> {
    const existing = await this.prisma.recipient.findUnique({
      where: { organizationId_email: { organizationId, email: dto.email.toLowerCase() } },
    });
    if (existing && !existing.deletedAt) {
      throw new BadRequestApiException("A recipient with this email already exists");
    }

    return this.prisma.recipient.create({
      data: {
        organizationId,
        email: dto.email.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        company: dto.company,
        phone: dto.phone,
        customFields: dto.customFields as unknown as object,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateRecipientDto): Promise<Recipient> {
    await this.getOne(organizationId, id);
    return this.prisma.recipient.update({
      where: { id },
      data: {
        email: dto.email?.toLowerCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        company: dto.company,
        phone: dto.phone,
        customFields: dto.customFields as unknown as object,
        status: dto.status,
      },
    });
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    await this.getOne(organizationId, id);
    await this.prisma.recipient.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async exportCsv(organizationId: string): Promise<string> {
    const recipients = await this.prisma.recipient.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    const rows = recipients.map((r) => ({
      email: r.email,
      firstName: r.firstName ?? "",
      lastName: r.lastName ?? "",
      company: r.company ?? "",
      phone: r.phone ?? "",
      status: r.status,
    }));

    return stringify(rows, { header: true, columns: ["email", "firstName", "lastName", "company", "phone", "status"] });
  }

  // --- CSV import: upload -> preview (no DB writes) -> confirm (commits) ---

  async previewCsvImport(
    organizationId: string,
    file: { buffer: Buffer; originalName: string; mimeType: string },
  ): Promise<{ fileAssetId: string } & CsvImportSummary> {
    const parsed = parseCsvBuffer(file.buffer);
    if (parsed.headers.length === 0) {
      throw new BadRequestApiException("CSV file has no header row or is empty");
    }

    const guessedEmailHeader = parsed.headers.find((h) => h.trim().toLowerCase() === "email");

    const existingRecipients = await this.prisma.recipient.findMany({
      where: { organizationId, deletedAt: null },
      select: { email: true },
    });
    const existingEmails = new Set(existingRecipients.map((r) => r.email));

    const summary = validateCsvRows(parsed, guessedEmailHeader, existingEmails);

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalName,
      mimeType: file.mimeType,
      folder: "csv-imports",
    });

    const asset = await this.prisma.fileAsset.create({
      data: {
        organizationId,
        key: uploaded.key,
        url: uploaded.url,
        mimeType: file.mimeType,
        sizeBytes: uploaded.sizeBytes,
        originalName: file.originalName,
      },
    });

    return { fileAssetId: asset.id, ...summary };
  }

  async confirmImport(
    organizationId: string,
    actorId: string,
    dto: ImportRecipientsDto,
  ): Promise<{ imported: number; skipped: number; listId?: string }> {
    const asset = await this.prisma.fileAsset.findFirst({ where: { id: dto.fileAssetId, organizationId } });
    if (!asset) throw new NotFoundApiException("Uploaded CSV file");

    // Local storage: read the file back by its public URL's key path is not
    // trivial to reverse; instead re-derive path via storage key stored on asset.
    const buffer = await this.readAssetBuffer(asset.key);
    const parsed = parseCsvBuffer(buffer);

    const emailMapping = dto.columnMappings.find((m) => m.mappedTo === "email");
    if (!emailMapping) throw new BadRequestApiException("An 'email' column mapping is required");

    const existingRecipients = await this.prisma.recipient.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, email: true },
    });
    const existingByEmail = new Map(existingRecipients.map((r) => [r.email, r.id]));

    let listId = dto.targetListId;
    if (!listId && dto.newListName) {
      const list = await this.prisma.recipientList.create({
        data: { organizationId, name: dto.newListName },
      });
      listId = list.id;
    }

    let imported = 0;
    let skipped = 0;
    const seen = new Set<string>();

    for (const row of parsed.rows) {
      const rawEmail = row[emailMapping.csvHeader]?.trim().toLowerCase();
      if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) || seen.has(rawEmail)) {
        skipped += 1;
        continue;
      }
      seen.add(rawEmail);

      const fields: Record<string, string> = {};
      for (const mapping of dto.columnMappings) {
        if (!mapping.mappedTo || mapping.mappedTo === "email") continue;
        const value = row[mapping.csvHeader];
        if (value !== undefined && value !== "") {
          if (mapping.mappedTo in FIELD_MAP) {
            fields[mapping.mappedTo] = value;
          }
        }
      }

      let recipientId = existingByEmail.get(rawEmail);
      if (!recipientId) {
        const created = await this.prisma.recipient.create({
          data: {
            organizationId,
            email: rawEmail,
            firstName: fields.firstName,
            lastName: fields.lastName,
            company: fields.company,
            phone: fields.phone,
          },
        });
        recipientId = created.id;
        existingByEmail.set(rawEmail, recipientId);
      }
      imported += 1;

      if (listId) {
        await this.prisma.recipientListMember.upsert({
          where: { recipientListId_recipientId: { recipientListId: listId, recipientId } },
          create: { recipientListId: listId, recipientId },
          update: {},
        });
      }
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: "recipients.import",
      resourceType: "Recipient",
      metadata: { imported, skipped, listId, fileAssetId: dto.fileAssetId },
    });

    return { imported, skipped, listId };
  }

  private async readAssetBuffer(key: string): Promise<Buffer> {
    // Local-disk-specific read path; kept here rather than in StorageService
    // since the interface only defines upload/getUrl/delete (Section: Storage
    // module contract) — reading back for CSV re-parse is a recipients-only
    // need, not part of the general storage abstraction.
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const rootDir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
    return fs.readFile(path.join(rootDir, key));
  }

  // --- Recipient Lists ---

  async listLists(organizationId: string): Promise<RecipientList[]> {
    return this.prisma.recipientList.findMany({ where: { organizationId, deletedAt: null }, orderBy: { name: "asc" } });
  }

  async createList(organizationId: string, dto: CreateRecipientListDto): Promise<RecipientList> {
    return this.prisma.recipientList.create({ data: { organizationId, name: dto.name, description: dto.description } });
  }

  async getList(organizationId: string, id: string): Promise<RecipientList> {
    const list = await this.prisma.recipientList.findFirst({ where: { id, organizationId, deletedAt: null } });
    if (!list) throw new NotFoundApiException("Recipient list");
    return list;
  }

  async addMembers(organizationId: string, listId: string, recipientIds: string[]): Promise<{ added: number }> {
    await this.getList(organizationId, listId);
    let added = 0;
    for (const recipientId of recipientIds) {
      const recipient = await this.prisma.recipient.findFirst({ where: { id: recipientId, organizationId } });
      if (!recipient) continue;
      await this.prisma.recipientListMember.upsert({
        where: { recipientListId_recipientId: { recipientListId: listId, recipientId } },
        create: { recipientListId: listId, recipientId },
        update: {},
      });
      added += 1;
    }
    return { added };
  }

  async removeMember(organizationId: string, listId: string, recipientId: string): Promise<void> {
    await this.getList(organizationId, listId);
    await this.prisma.recipientListMember.deleteMany({ where: { recipientListId: listId, recipientId } });
  }

  async softDeleteList(organizationId: string, id: string): Promise<void> {
    await this.getList(organizationId, id);
    await this.prisma.recipientList.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
