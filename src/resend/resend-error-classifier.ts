import type { SendClassification } from "./resend.types";

// Classifies Resend SDK errors into TRANSIENT (safe to retry with backoff),
// PERMANENT (retrying will never succeed — bad address, invalid domain,
// content rejected) or UNKNOWN (treated as TRANSIENT-with-caution by the
// caller, but logged distinctly for investigation).
//
// ASSUMPTION: Resend's error `name`/`statusCode` values below are based on
// the Resend API docs as of this writing (rate_limit_exceeded, validation_error,
// invalid_idempotency_key, etc.) and SHOULD BE RECONCILED against live Resend
// SDK error shapes / API responses before relying on this in production —
// the SDK may wrap errors differently across versions.
export function classifyResendError(error: unknown): SendClassification {
  const statusCode = extractStatusCode(error);
  const name = extractName(error);

  if (statusCode !== undefined) {
    if (statusCode === 429) return "TRANSIENT"; // rate limited
    if (statusCode >= 500) return "TRANSIENT"; // provider-side failure
    if (statusCode >= 400 && statusCode < 500) return "PERMANENT"; // bad request/validation/auth
  }

  if (name) {
    const lower = name.toLowerCase();
    if (lower.includes("rate_limit") || lower.includes("timeout") || lower.includes("network")) {
      return "TRANSIENT";
    }
    if (
      lower.includes("validation") ||
      lower.includes("invalid") ||
      lower.includes("not_found") ||
      lower.includes("missing")
    ) {
      return "PERMANENT";
    }
  }

  return "UNKNOWN";
}

function extractStatusCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.statusCode === "number") return e.statusCode;
    if (typeof e.status === "number") return e.status;
  }
  return undefined;
}

function extractName(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.name === "string") return e.name;
    if (typeof e.code === "string") return e.code;
  }
  return undefined;
}
