import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { CSRF_COOKIE_NAME } from "../session.util";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "x-csrf-token";

// Double-submit cookie CSRF check: the csrf cookie (readable JS, set at
// login) must match the X-CSRF-Token header on every cookie-authenticated
// mutation. A cross-site request can send the cookie automatically but
// cannot read it to populate the header.
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
