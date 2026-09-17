import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "session_token";
export const CSRF_COOKIE_NAME = "csrf_token";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
