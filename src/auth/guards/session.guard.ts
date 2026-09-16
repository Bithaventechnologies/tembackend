import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SESSION_COOKIE_NAME, hashToken } from "../session.util";
import type { AuthenticatedUser } from "../auth.types";

// Validates the opaque session cookie against AdminSession.tokenHash,
// rejecting missing/unknown/expired/revoked sessions. Attaches the resolved
// AuthenticatedUser (with default org membership) onto req.user.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!rawToken) throw new UnauthorizedException("No active session");

    const tokenHash = hashToken(rawToken);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: {
        adminUser: {
          include: { memberships: { include: { organization: true }, take: 1 } },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Session expired or invalid");
    }
    if (!session.adminUser.isActive) {
      throw new UnauthorizedException("Account disabled");
    }

    const membership = session.adminUser.memberships[0];
    if (!membership) {
      throw new UnauthorizedException("No organization membership");
    }

    const user: AuthenticatedUser = {
      id: session.adminUser.id,
      email: session.adminUser.email,
      name: session.adminUser.name,
      organizationId: membership.organizationId,
      role: membership.role,
      sessionId: session.id,
    };

    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }
}
