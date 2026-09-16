import { z } from "zod";

export const campaignStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "SENDING",
  "COMPLETED",
  "PARTIALLY_FAILED",
  "FAILED",
  "CANCELLED",
]);

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  templateId: z.string().cuid(),
  recipientListId: z.string().cuid().optional(),
  manualRecipientEmails: z.array(z.string().email()).optional(),
  signatureId: z.string().cuid().optional(),
  customVariableOverrides: z.record(z.string()).default({}),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const sendCampaignSchema = z.object({
  idempotencyKey: z.string().min(10),
  confirmedRecipientCount: z.number().int().min(0),
});
export type SendCampaignInput = z.infer<typeof sendCampaignSchema>;

export const emailStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "BOUNCED",
  "OPENED",
  "CLICKED",
  "SUPPRESSED",
  "CANCELLED",
]);
export type EmailStatus = z.infer<typeof emailStatusSchema>;

// Bulk-send confirmation tiers (Section 54)
export function getBulkSendConfirmationTier(recipientCount: number): "normal" | "enhanced" | "explicit" {
  if (recipientCount > 1000) return "explicit";
  if (recipientCount > 100) return "enhanced";
  return "normal";
}
