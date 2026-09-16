export type SendClassification = "TRANSIENT" | "PERMANENT" | "UNKNOWN";

export interface SendEmailInput {
  to: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  // Arbitrary metadata Resend echoes back on webhook events (e.g. our
  // internal EmailMessage id) — used to correlate webhook events safely
  // even before providerMessageId is known to the caller.
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export class SendEmailError extends Error {
  constructor(
    message: string,
    public readonly classification: SendClassification,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SendEmailError";
  }
}
