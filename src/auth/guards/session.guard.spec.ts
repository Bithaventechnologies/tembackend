import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SessionGuard } from "./session.guard";
import { hashToken } from "../session.util";

function buildContext(cookies: Record<string, string>): ExecutionContext {
  const req = { cookies };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("SessionGuard", () => {
  const reflector = new Reflector();

  it("rejects a request with no session cookie", async () => {
    const prisma = { adminSession: { findUnique: jest.fn() } };
    const guard = new SessionGuard(prisma as never, reflector);
    await expect(guard.canActivate(buildContext({}))).rejects.toThrow(UnauthorizedException);
    expect(prisma.adminSession.findUnique).not.toHaveBeenCalled();
  });

  it("rejects expired and revoked sessions", async () => {
    const rawToken = "raw-token-value";
    for (const session of [
      { revokedAt: null, expiresAt: new Date(Date.now() - 1000) },
      { revokedAt: new Date(), expiresAt: new Date(Date.now() + 100000) },
    ]) {
      const prisma = { adminSession: { findUnique: jest.fn().mockResolvedValue({
        id: "sess_1", tokenHash: hashToken(rawToken), ...session,
        adminUser: { isActive: true, memberships: [{ organizationId: "org_1", role: "ADMIN" }] },
      }) } };
      const guard = new SessionGuard(prisma as never, reflector);
      await expect(guard.canActivate(buildContext({ session_token: rawToken }))).rejects.toThrow(UnauthorizedException);
    }
  });

  it("attaches the authenticated user for a valid session", async () => {
    const rawToken = "raw-token-value";
    const req = { cookies: { session_token: rawToken } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }), getHandler: () => ({}), getClass: () => ({}),
    } as unknown as ExecutionContext;
    const prisma = { adminSession: { findUnique: jest.fn().mockResolvedValue({
      id: "sess_1", tokenHash: hashToken(rawToken), revokedAt: null, expiresAt: new Date(Date.now() + 100000),
      adminUser: { id: "user_1", email: "a@b.com", name: "A", isActive: true,
        memberships: [{ organizationId: "org_1", role: "ADMIN" }] },
    }) } };
    await expect(new SessionGuard(prisma as never, reflector).canActivate(context)).resolves.toBe(true);
    expect((req as unknown as { user: { organizationId: string } }).user.organizationId).toBe("org_1");
  });
});
