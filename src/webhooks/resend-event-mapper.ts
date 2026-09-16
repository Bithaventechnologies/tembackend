import type { EmailEventType } from "@prisma/client";

// ASSUMPTION: these event type strings mirror Resend's documented webhook
// event names (email.sent / email.delivered / email.delivery_delayed /
// email.bounced / email.complained / email.opened / email.clicked /
// email.failed) as of this writing. RECONCILE THIS MAPPING AGAINST LIVE
// RESEND DOCS/PAYLOADS before relying on it in production — Resend may add,
// rename, or restructure event types, and this is the single place that
// would need updating.
const RESEND_EVENT_TYPE_MAP: Record<string, EmailEventType> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.delivery_delayed": "DELIVERY_DELAYED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.failed": "FAILED",
};

export function mapResendEventType(resendType: string): EmailEventType | null {
  return RESEND_EVENT_TYPE_MAP[resendType] ?? null;
}

export interface ResendWebhookPayload {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    id?: string;
    to?: string[] | string;
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
    [key: string]: unknown;
  };
}

// Resend's `email_id` (or `id`) correlates to our stored providerMessageId.
// We also look for our own `email_message_id` tag as a fallback correlation
// path, since we always attach it when sending (see ResendEmailService/queue
// processor `tags`).
export function extractProviderMessageId(payload: ResendWebhookPayload): string | undefined {
  return payload.data.email_id ?? payload.data.id;
}

export function extractEmailMessageIdTag(payload: ResendWebhookPayload): string | undefined {
  const tags = payload.data.tags;
  if (!tags) return undefined;
  if (Array.isArray(tags)) {
    return tags.find((t) => t.name === "email_message_id")?.value;
  }
  return tags.email_message_id;
}
