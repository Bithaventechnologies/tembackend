import { WebhooksService } from "./webhooks.service";
import { Prisma } from "@prisma/client";
import type { ResendWebhookPayload } from "./resend-event-mapper";

// Minimal fakes — this test only exercises handleEvent()'s idempotency path,
// not signature verification (covered separately/manually against live
// Resend payloads per the module's ASSUMPTION comment).
function buildPrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
  const emailMessage = {
    id: "msg_1",
    organizationId: "org_1",
    recipientId: "rec_1",
    providerMessageId: "prov_1",
    status: "SENT",
  };

  const createCalls: unknown[] = [];

  return {
    emailMessage: {
      findUnique: jest.fn().mockResolvedValue(emailMessage),
      update: jest.fn().mockResolvedValue(emailMessage),
    },
    emailEvent: {
      create: jest.fn(async (args: unknown) => {
        createCalls.push(args);
        if (createCalls.length > 1) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "5.20.0",
          });
        }
        return { id: "evt_1" };
      }),
    },
    ...overrides,
    __createCalls: createCalls,
  };
}

function buildConfigMock() {
  return { getOrThrow: jest.fn().mockReturnValue("whsec_test") } as unknown as import("@nestjs/config").ConfigService;
}

describe("WebhooksService.handleEvent idempotency", () => {
  it("does not double-count a duplicate provider event id", async () => {
    const prisma = buildPrismaMock();
    const suppression = { add: jest.fn() };

    const service = new WebhooksService(
      prisma as never,
      buildConfigMock(),
      suppression as never,
    );

    const payload: ResendWebhookPayload = {
      type: "email.delivered",
      created_at: "2026-01-01T00:00:00.000Z",
      data: { email_id: "prov_1", event_id: "evt-fixed-id" },
    };

    await service.handleEvent(payload);
    await service.handleEvent(payload); // duplicate delivery of the same webhook

    expect(prisma.emailEvent.create).toHaveBeenCalledTimes(2);
    // Second call throws P2002 inside the mock and is swallowed by the
    // service — status update should still only reflect a single logical event.
    expect(prisma.emailMessage.update).toHaveBeenCalledTimes(1);
  });

  it("adds the recipient to suppression on a bounce event", async () => {
    const prisma = buildPrismaMock();
    const suppression = { add: jest.fn() };

    const service = new WebhooksService(prisma as never, buildConfigMock(), suppression as never);

    await service.handleEvent({
      type: "email.bounced",
      data: { email_id: "prov_1", to: ["bounced@example.com"] },
    });

    expect(suppression.add).toHaveBeenCalledWith("org_1", "bounced@example.com", "HARD_BOUNCE", "email.bounced", "rec_1");
  });

  it("ignores unrecognized event types without touching the database", async () => {
    const prisma = buildPrismaMock();
    const suppression = { add: jest.fn() };
    const service = new WebhooksService(prisma as never, buildConfigMock(), suppression as never);

    await service.handleEvent({ type: "email.some_future_event", data: {} });

    expect(prisma.emailEvent.create).not.toHaveBeenCalled();
  });
});
