import { z } from "zod";

export const recipientStatusSchema = z.enum([
  "ACTIVE",
  "INVALID",
  "BOUNCED",
  "UNSUBSCRIBED",
  "SUPPRESSED",
]);

export const createRecipientSchema = z.object({
  email: z.string().email(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(50).optional(),
  customFields: z.record(z.string()).optional(),
});
export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;

export const updateRecipientSchema = createRecipientSchema.partial().extend({
  status: recipientStatusSchema.optional(),
});
export type UpdateRecipientInput = z.infer<typeof updateRecipientSchema>;

export const createRecipientListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
});
export type CreateRecipientListInput = z.infer<typeof createRecipientListSchema>;

export const csvColumnMappingSchema = z.object({
  csvHeader: z.string(),
  mappedTo: z.string().nullable(), // recipient field key, or null to ignore
});
export type CsvColumnMapping = z.infer<typeof csvColumnMappingSchema>;

export const importRecipientsSchema = z.object({
  fileAssetId: z.string().cuid(),
  columnMappings: z.array(csvColumnMappingSchema),
  targetListId: z.string().cuid().optional(),
  newListName: z.string().trim().min(1).max(200).optional(),
});
export type ImportRecipientsInput = z.infer<typeof importRecipientsSchema>;

export interface CsvValidationRow {
  rowNumber: number;
  data: Record<string, string>;
  email: string | null;
  isValidEmail: boolean;
  isDuplicateInFile: boolean;
  isEmptyRow: boolean;
}

export interface CsvImportSummary {
  totalRows: number;
  validEmails: number;
  invalidEmails: number;
  duplicates: number;
  missingEmail: number;
  headers: string[];
  sampleRows: CsvValidationRow[];
}

export const KNOWN_RECIPIENT_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "company",
  "phone",
] as const;
