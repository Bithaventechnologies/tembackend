import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { classifyResendError } from "./resend-error-classifier";
import { SendEmailError, type SendEmailInput, type SendEmailResult } from "./resend.types";

// The ONLY module allowed to touch RESEND_API_KEY / the Resend SDK client.
// Every other module (templates test-send, queue worker) calls through here.
@Injectable()
export class ResendEmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: Resend;

  constructor(private readonly config: ConfigService) {
    this.client = new Resend(this.config.getOrThrow<string>("RESEND_API_KEY"));
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const result = await this.client.emails.send({
        from: `${input.fromName} <${input.fromEmail}>`,
        to: input.to,
        replyTo: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: input.tags,
      });

      if (result.error) {
        const classification = classifyResendError(result.error);
        this.logger.warn(`Resend send failed (${classification}) for recipient: ${maskEmail(input.to)}`);
        throw new SendEmailError(result.error.message ?? "Resend send failed", classification, result.error);
      }

      if (!result.data?.id) {
        throw new SendEmailError("Resend returned no message id", "UNKNOWN");
      }

      return { providerMessageId: result.data.id };
    } catch (error) {
      if (error instanceof SendEmailError) throw error;
      const classification = classifyResendError(error);
      this.logger.error(`Resend send threw (${classification}) for recipient: ${maskEmail(input.to)}`);
      throw new SendEmailError(error instanceof Error ? error.message : "Unknown Resend error", classification, error);
    }
  }

  async sendTest(input: SendEmailInput): Promise<SendEmailResult> {
    // Test sends use the exact same rendering/send path as real sends
    // (Section: "This is the ONLY rendering path") — the only difference is
    // that callers mark the resulting EmailMessage isTest=true.
    return this.send(input);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local?.slice(0, 2) ?? ""}***@${domain}`;
}
