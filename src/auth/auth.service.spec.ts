import { UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "./auth.service";

function buildConfigMock(overrides: Record<string, number> = {}) {
  const values: Record<string, number> = { LOGIN_LOCKOUT_THRESHOLD: 3, LOGIN_LOCKOUT_MINUTES: 30, ...overrides };
  return { get: jest.fn((key: string, fallback?: number) => values[key] ?? fallback) } as unknown as import("@nestjs/config").ConfigService;
}

describe("AuthService login lockout", () => {
  it("locks the account after reaching the failed-attempt threshold", async () => {
    const passwordHash = await argon2.hash("CorrectHorseBattery1!", { type: argon2.argon2id });
    let currentUser = {
      id: "user_1",
      email: "user@example.com",
      passwordHash,
      isActive: true,
      failedLoginAttempts: 2, // one more failure reaches the threshold of 3
      lockedUntil: null as Date | null,
    };

    const prisma = {
      adminUser: {
        findUnique: jest.fn(async () => currentUser),
        update: jest.fn(async ({ data }: { data: Partial<typeof currentUser> }) => {
          currentUser = { ...currentUser, ...data };
          return currentUser;
        }),
      },
      loginAttempt: { create: jest.fn().mockResolvedValue({}) },
      adminSession: { create: jest.fn().mockResolvedValue({}) },
      passwordResetToken: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const audit = { log: jest.fn() };

    const service = new AuthService(prisma as never, buildConfigMock(), audit as never);

    await expect(service.login("user@example.com", "wrong-password", "127.0.0.1", "test-agent")).rejects.toThrow(
      UnauthorizedException,
    );

    expect(currentUser.failedLoginAttempts).toBe(3);
    expect(currentUser.lockedUntil).not.toBeNull();

    // A subsequent attempt with the CORRECT password is still rejected while locked.
    currentUser.lockedUntil = new Date(Date.now() + 60_000);
    await expect(
      service.login("user@example.com", "CorrectHorseBattery1!", "127.0.0.1", "test-agent"),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("resets the failure counter on a successful login", async () => {
    const passwordHash = await argon2.hash("CorrectHorseBattery1!", { type: argon2.argon2id });
    let currentUser = {
      id: "user_1",
      email: "user@example.com",
      passwordHash,
      isActive: true,
      failedLoginAttempts: 2,
      lockedUntil: null as Date | null,
    };

    const prisma = {
      adminUser: {
        findUnique: jest.fn(async () => currentUser),
        update: jest.fn(async ({ data }: { data: Partial<typeof currentUser> }) => {
          currentUser = { ...currentUser, ...data };
          return currentUser;
        }),
      },
      loginAttempt: { create: jest.fn().mockResolvedValue({}) },
      adminSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const audit = { log: jest.fn() };

    const service = new AuthService(prisma as never, buildConfigMock(), audit as never);
    const result = await service.login("user@example.com", "CorrectHorseBattery1!", "127.0.0.1", "test-agent");

    expect(result.user.email).toBe("user@example.com");
    expect(currentUser.failedLoginAttempts).toBe(0);
  });
});
