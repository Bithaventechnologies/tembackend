import { z } from "zod";

// Email-safe block-based document model. This is the single source of truth
// for template content — compiled to MJML -> email-safe HTML by
// packages/email, and rendered identically for preview/test/send.

export const textAlignSchema = z.enum(["left", "center", "right"]);

export const headingBlockSchema = z.object({
  type: z.literal("heading"),
  id: z.string(),
  level: z.enum(["h1", "h2", "h3"]).default("h1"),
  text: z.string(),
  align: textAlignSchema.default("left"),
  color: z.string().optional(),
});

export const paragraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  id: z.string(),
  html: z.string(), // sanitized inline HTML (bold/italic/underline/links)
  align: textAlignSchema.default("left"),
  color: z.string().optional(),
});

export const buttonBlockSchema = z.object({
  type: z.literal("button"),
  id: z.string(),
  text: z.string(),
  url: z.string(),
  align: textAlignSchema.default("center"),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
});

export const imageBlockSchema = z.object({
  type: z.literal("image"),
  id: z.string(),
  src: z.string(),
  alt: z.string().default(""),
  href: z.string().optional(),
  width: z.number().optional(),
  align: textAlignSchema.default("center"),
});

export const dividerBlockSchema = z.object({
  type: z.literal("divider"),
  id: z.string(),
  color: z.string().optional(),
});

export const spacerBlockSchema = z.object({
  type: z.literal("spacer"),
  id: z.string(),
  height: z.number().min(4).max(120).default(16),
});

export const listBlockSchema = z.object({
  type: z.literal("list"),
  id: z.string(),
  ordered: z.boolean().default(false),
  items: z.array(z.string()),
});

export const tableBlockSchema = z.object({
  type: z.literal("table"),
  id: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const emailBlockSchema = z.discriminatedUnion("type", [
  headingBlockSchema,
  paragraphBlockSchema,
  buttonBlockSchema,
  imageBlockSchema,
  dividerBlockSchema,
  spacerBlockSchema,
  listBlockSchema,
  tableBlockSchema,
]);
export type EmailBlock = z.infer<typeof emailBlockSchema>;

export const emailDocumentSchema = z.object({
  blocks: z.array(emailBlockSchema),
});
export type EmailDocument = z.infer<typeof emailDocumentSchema>;

// Matches {{variableKey}} tokens anywhere in block text/html/url fields.
export const VARIABLE_TOKEN_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractVariableKeys(doc: EmailDocument, subject: string, previewText?: string): string[] {
  const keys = new Set<string>();
  const scan = (text: string) => {
    for (const match of text.matchAll(VARIABLE_TOKEN_REGEX)) {
      const key = match[1];
      if (key) keys.add(key);
    }
  };

  scan(subject);
  if (previewText) scan(previewText);

  for (const block of doc.blocks) {
    switch (block.type) {
      case "heading":
        scan(block.text);
        break;
      case "paragraph":
        scan(block.html);
        break;
      case "button":
        scan(block.text);
        scan(block.url);
        break;
      case "image":
        scan(block.alt);
        if (block.href) scan(block.href);
        break;
      case "list":
        block.items.forEach(scan);
        break;
      case "table":
        block.headers.forEach(scan);
        block.rows.forEach((row) => row.forEach(scan));
        break;
      default:
        break;
    }
  }

  return Array.from(keys);
}
