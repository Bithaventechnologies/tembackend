import { CampaignsService } from "./campaigns.service";
import { ConflictApiException } from "../common/exceptions/api.exceptions";

function buildConfigMock() {
  const values: Record<string, string | number> = {
    RESEND_FROM_EMAIL: "no-reply@test.local",
    RESEND_FROM_NAME: "Test Co",
    EMAIL_SEND_CONCURRENCY: 5,
    EMAIL_SEND_RATE_PER_SECOND: 10,
  };
  return {
    getOrThrow: jest.fn((key: string) => {
      const v = values[key];
      if (v === undefined) throw new Error(`missing ${key}`);
      return v;
    }),
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as import("@nestjs/config").ConfigService;
}

describe("CampaignsService.send suppression filtering", () => {
  it("marks suppressed recipients as SUPPRESSED and only enqueues non-suppressed ones", async () => {
    const campaignRow = {
      id: "camp_1",
      organizationId: "org_1",
      status: "DRAFT",
      templateVersionId: "tv_1",
      idempotencyKey: null,
    };

    const campaignRecipients = [
      { id: "cr_1", recipientId: "rec_1", recipient: { id: "rec_1", email: "good@example.com" } },
      { id: "cr_2", recipientId: "rec_2", recipient: { id: "rec_2", email: "bounced@example.com" } },
    ];

    const createdMessages: Array<Record<string, unknown>> = [];

    const tx = {
      campaign: {
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...campaignRow, status: "QUEUED" }),
      },
      emailMessage: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdMessages.push(data);
          return data;
        }),
      },
    };

    const prisma = {
      campaign: {
        findFirst: jest.fn().mockResolvedValue(campaignRow),
        findUnique: jest.fn().mockResolvedValue(null), // no existing campaign with this idempotency key
      },
      campaignRecipient: {
        findMany: jest.fn().mockResolvedValue(campaignRecipients),
      },
      templateVersion: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "tv_1",
          subject: "Hello",
          bodyHtml: "<p>Hi</p>",
          bodyText: "Hi",
        }),
      },
      emailMessage: {
        findMany: jest.fn().mockResolvedValue([{ id: "msg_1" }]), // only the QUEUED (non-suppressed) one
      },
      $transaction: jest.fn(async (cb: (transaction: typeof tx) => unknown) => cb(tx)),
    };

    const audit = { log: jest.fn() };
    const branding = {};
    const signatures = {};
    const suppression = {
      getSuppressedSet: jest.fn().mockResolvedValue(new Set(["bounced@example.com"])),
    };
    const emailQueue = { add: jest.fn().mockResolvedValue({}) };

    const service = new CampaignsService(
      prisma as never,
      audit as never,
      branding as never,
      signatures as never,
      suppression as never,
      buildConfigMock(),
      emailQueue as never,
    );

    await service.send("org_1", "actor_1", "camp_1", { idempotencyKey: "a-long-enough-key", confirmedRecipientCount: 2 });

    expect(createdMessages).toHaveLength(2);
    const suppressedMsg = createdMessages.find((m) => m.recipientId === "rec_2");
    const queuedMsg = createdMessages.find((m) => m.recipientId === "rec_1");
    expect(suppressedMsg?.status).toBe("SUPPRESSED");
    expect(queuedMsg?.status).toBe("QUEUED");

    // Only one job enqueued (for the non-suppressed message).
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledWith(
      "send-email",
      { emailMessageId: "msg_1" },
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it("refuses to send a campaign that is not in DRAFT status", async () => {
    const prisma = {
      campaign: { findFirst: jest.fn().mockResolvedValue({ id: "camp_1", organizationId: "org_1", status: "SENDING" }) },
    };
    const service = new CampaignsService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      { getSuppressedSet: jest.fn() } as never,
      buildConfigMock(),
      { add: jest.fn() } as never,
    );

    await expect(
      service.send("org_1", "actor_1", "camp_1", { idempotencyKey: "a-long-enough-key", confirmedRecipientCount: 0 }),
    ).rejects.toThrow(ConflictApiException);
  });
});
