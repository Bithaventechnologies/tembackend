import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { generateOpaqueToken, hashToken, SESSION_TTL_MS } from "./session.util";
import type { AdminUser } from "@prisma/client";

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

@Injectable()
export class AuthService {
  private readonly lockoutThreshold: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.lockoutThreshold = this.config.get<number>("LOGIN_LOCKOUT_THRESHOLD", 10);
    this.lockoutMinutes = this.config.get<number>("LOGIN_LOCKOUT_MINUTES", 30);
  }

  async login(
    email: string,
    password: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
  ): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.adminUser.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      await this.recordAttempt(normalizedEmail, false, ipAddress, userAgent, null);
      throw new UnauthorizedException("Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordAttempt(normalizedEmail, false, ipAddress, userAgent, user.id);
      throw new UnauthorizedException("Account is temporarily locked due to too many failed attempts");
    }

    if (!user.isActive) {
      await this.recordAttempt(normalizedEmail, false, ipAddress, userAgent, user.id);
      throw new UnauthorizedException("Account is disabled");
    }

    const passwordValid = await argon2.verify(user.passwordHash, password).catch(() => false);

    if (!passwordValid) {
      await this.handleFailedLogin(user);
      await this.recordAttempt(normalizedEmail, false, ipAddress, userAgent, user.id);
      throw new UnauthorizedException("Invalid email or password");
    }

    // Successful login resets the failure counter.
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.recordAttempt(normalizedEmail, true, ipAddress, userAgent, user.id);

    const sessionToken = generateOpaqueToken();
    const csrfToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.adminSession.create({
      data: {
        adminUserId: user.id,
        tokenHash: hashToken(sessionToken),
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      },
    });

    await this.audit.log({
      actorId: user.id,
      action: "auth.login",
      resourceType: "AdminUser",
      resourceId: user.id,
      ipAddress: ipAddress ?? null,
    });

    return {
      sessionToken,
      csrfToken,
      expiresAt,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  private async handleFailedLogin(user: AdminUser): Promise<void> {
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const shouldLock = failedLoginAttempts >= this.lockoutThreshold;

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts,
        lockedUntil: shouldLock ? new Date(Date.now() + this.lockoutMinutes * 60 * 1000) : user.lockedUntil,
      },
    });
  }

  private async recordAttempt(
    email: string,
    success: boolean,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    adminUserId: string | null,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email,
        success,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        adminUserId,
      },
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.adminUser.findUnique({ where: { email: normalizedEmail } });
    // Always behave the same whether or not the account exists, to avoid
    // leaking which emails are registered.
    if (!user) return;

    const rawToken = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        adminUserId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // TODO(live-credentials): wire an actual transactional-email send here
    // (e.g. via ResendEmailService) once a "password reset" template exists.
    // For now the raw token is only ever returned to the caller in non-prod
    // via the reset flow test harness; production requires email delivery.
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired reset token");
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: resetToken.adminUserId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all existing sessions on password reset.
      this.prisma.adminSession.updateMany({
        where: { adminUserId: resetToken.adminUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      actorId: resetToken.adminUserId,
      action: "auth.password_reset",
      resourceType: "AdminUser",
      resourceId: resetToken.adminUserId,
    });
  }
}
