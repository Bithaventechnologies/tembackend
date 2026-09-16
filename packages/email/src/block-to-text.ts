import type { EmailBlock } from "@email-platform/types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function renderBlockText(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
      return block.text.toUpperCase();
    case "paragraph":
      return stripHtml(block.html);
    case "button":
      return `${block.text}: ${block.url}`;
    case "image":
      return block.alt ? `[Image: ${block.alt}]` : "";
    case "divider":
      return "----------------------------------------";
    case "spacer":
      return "";
    case "list":
      return block.items.map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join("\n");
    case "table":
      return [block.headers.join(" | "), ...block.rows.map((r) => r.join(" | "))].join("\n");
    default:
      return "";
  }
}

export interface BrandingForText {
  companyName: string;
  websiteUrl?: string;
  supportEmail?: string;
  address?: string;
  footerText?: string;
}

export function compileDocumentToText(
  blocks: EmailBlock[],
  branding: BrandingForText,
  signatureText?: string
): string {
  const body = blocks
    .map(renderBlockText)
    .filter((line) => line.length > 0)
    .join("\n\n");

  const footerLines: string[] = [
    branding.companyName,
    [branding.supportEmail, branding.websiteUrl].filter((v): v is string => !!v).join(" | "),
    branding.address,
    branding.footerText,
  ].filter((line): line is string => !!line);

  return [body, signatureText, "----------------------------------------", ...footerLines]
    .filter(Boolean)
    .join("\n\n");
}
