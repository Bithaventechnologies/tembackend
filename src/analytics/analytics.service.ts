import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundApiException } from "../common/exceptions/api.exceptions";

export interface DashboardAnalytics {
  totals: {
    sent: number;
    delivered: number;
    failed: number;
    bounced: number;
    opened: number;
    clicked: number;
  };
  rates: {
    deliveryRate: number;
    failureRate: number;
    bounceRate: number;
    openRate: number;
    clickRate: number;
  };
  trends: Array<{ date: string; sent: number; delivered: number; failed: number }>;
  recentCampaigns: Array<{ id: string; name: string; status: string; totalRecipients: number; createdAt: Date }>;
  recentFailures: Array<{ id: string; subject: string; failureReason: string | null; failedAt: Date | null }>;
  mostUsedTemplates: Array<{ templateId: string; name: string; usageCount: number }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(organizationId: string, dateFrom?: Date, dateTo?: Date): Promise<DashboardAnalytics> {
    const dateFilter = {
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const baseWhere = { organizationId, ...dateFilter };

    const [sent, delivered, failed, bounced, opened, clicked] = await Promise.all([
      this.prisma.emailMessage.count({ where: { ...baseWhere, status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] } } }),
      this.prisma.emailMessage.count({ where: { ...baseWhere, status: "DELIVERED" } }),
      this.prisma.emailMessage.count({ where: { ...baseWhere, status: "FAILED" } }),
      this.prisma.emailMessage.count({ where: { ...baseWhere, status: "BOUNCED" } }),
      this.prisma.emailMessage.count({ where: { ...baseWhere, status: "OPENED" } }),
      this.prisma.emailMessage.count({ where: { ...baseWhere, status: "CLICKED" } }),
    ]);

    const totalAttempted = sent + failed + bounced || 1;

    const trendsRaw = await this.prisma.$queryRaw<Array<{ day: Date; status: string; count: bigint }>>`
      SELECT date_trunc('day', "createdAt") as day, status, COUNT(*) as count
      FROM "EmailMessage"
      WHERE "organizationId" = ${organizationId}
      GROUP BY day, status
      ORDER BY day ASC
      LIMIT 500
    `;

    const trendMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    for (const row of trendsRaw) {
      const key = row.day.toISOString().slice(0, 10);
      const entry = trendMap.get(key) ?? { sent: 0, delivered: 0, failed: 0 };
      const count = Number(row.count);
      if (["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(row.status)) entry.sent += count;
      if (row.status === "DELIVERED") entry.delivered += count;
      if (row.status === "FAILED") entry.failed += count;
      trendMap.set(key, entry);
    }
    const trends = Array.from(trendMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .slice(-30);

    const recentCampaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, status: true, totalRecipients: true, createdAt: true },
    });

    const recentFailures = await this.prisma.emailMessage.findMany({
      where: { organizationId, status: "FAILED" },
      orderBy: { failedAt: "desc" },
      take: 10,
      select: { id: true, subject: true, failureReason: true, failedAt: true },
    });

    const templateUsage = await this.prisma.campaign.groupBy({
      by: ["templateId"],
      where: { organizationId },
      _count: { templateId: true },
      orderBy: { _count: { templateId: "desc" } },
      take: 5,
    });
    const templateIds = templateUsage.map((t) => t.templateId);
    const templates = await this.prisma.emailTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } });
    const templateNameById = new Map(templates.map((t) => [t.id, t.name]));
    const mostUsedTemplates = templateUsage.map((t) => ({
      templateId: t.templateId,
      name: templateNameById.get(t.templateId) ?? "Unknown",
      usageCount: t._count.templateId,
    }));

    return {
      totals: { sent, delivered, failed, bounced, opened, clicked },
      rates: {
        deliveryRate: round(delivered / totalAttempted),
        failureRate: round(failed / totalAttempted),
        bounceRate: round(bounced / totalAttempted),
        openRate: round(delivered > 0 ? opened / delivered : 0),
        clickRate: round(delivered > 0 ? clicked / delivered : 0),
      },
      trends,
      recentCampaigns,
      recentFailures,
      mostUsedTemplates,
    };
  }

  async campaignAnalytics(organizationId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    if (!campaign) throw new NotFoundApiException("Campaign");

    const grouped = await this.prisma.emailMessage.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { status: true },
    });

    const statusCounts = Object.fromEntries(grouped.map((g) => [g.status, g._count.status]));

    const eventCounts = await this.prisma.emailEvent.groupBy({
      by: ["eventType"],
      where: { emailMessage: { campaignId } },
      _count: { eventType: true },
    });

    return {
      campaign,
      statusCounts,
      eventCounts: Object.fromEntries(eventCounts.map((e) => [e.eventType, e._count.eventType])),
    };
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
