import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  async isSuppressed(organizationId: string, email: string): Promise<boolean> {
    const entry = await this.prisma.suppressionEntry.findUnique({
      where: { organizationId_email: { organizationId, email: email.toLowerCase() } },
    });
    return !!entry;
  }

  async getSuppressedSet(organizationId: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const entries = await this.prisma.suppressionEntry.findMany({
      where: { organizationId, email: { in: emails.map((e) => e.toLowerCase()) } },
      select: { email: true },
    });
    return new Set(entries.map((e) => e.email));
  }

  async add(
    organizationId: string,
    email: string,
    reason: "HARD_BOUNCE" | "COMPLAINT" | "UNSUBSCRIBE" | "MANUAL" | "INVALID_EMAIL",
    detail?: string,
    recipientId?: string | null,
  ): Promise<void> {
    await this.prisma.suppressionEntry.upsert({
      where: { organizationId_email: { organizationId, email: email.toLowerCase() } },
      create: { organizationId, email: email.toLowerCase(), reason, detail, recipientId },
      update: { reason, detail },
    });
  }
}
