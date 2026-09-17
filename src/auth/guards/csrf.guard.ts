import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { CSRF_COOKIE_NAME } from "../session.util";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-csrf-token";

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const headerToken = request.header(CSRF_HEADER);
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException("Invalid or missing CSRF token");
    }
    return true;
  }
}
