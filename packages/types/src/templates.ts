import { z } from "zod";
import { emailDocumentSchema } from "./email-blocks";

export const templateVariableInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Variable key must be a valid identifier"),
  label: z.string().trim().min(1).max(120),
  isRequired: z.boolean().default(false),
  defaultValue: z.string().optional(),
  source: z.enum(["RECIPIENT", "SYSTEM", "BRANDING", "CUSTOM"]).default("RECIPIENT"),
});
export type TemplateVariableInput = z.infer<typeof templateVariableInputSchema>;

export const createTemplateSchema = z.object({
  categoryId: z.string().cuid(),
  name: z.string().trim().min(1).max(200),
  classification: z.enum(["TRANSACTIONAL", "MARKETING"]).default("TRANSACTIONAL"),
  subject: z.string().trim().min(1).max(300),
  previewText: z.string().trim().max(300).optional(),
  body: emailDocumentSchema,
  variables: z.array(templateVariableInputSchema).default([]),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().cuid().optional(),
  classification: z.enum(["TRANSACTIONAL", "MARKETING"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  previewText: z.string().trim().max(300).optional(),
  body: emailDocumentSchema.optional(),
  variables: z.array(templateVariableInputSchema).optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const sendTestEmailSchema = z.object({
  toEmail: z.string().email(),
  sampleVariables: z.record(z.string()).default({}),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;

// System variables always available regardless of template, resolved server-side.
export const SYSTEM_VARIABLE_KEYS = ["currentDate"] as const;
export const BRANDING_VARIABLE_KEYS = ["companyName", "signature"] as const;
