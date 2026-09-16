import mjml2html from "mjml";
import type { EmailBlock } from "@email-platform/types";
import { compileDocumentToMjml, type BrandingForRender } from "./block-to-mjml";
import { compileDocumentToText, type BrandingForText } from "./block-to-text";
import { interpolateVariables, findUnresolvedVariables } from "./variables";

export interface RenderEmailInput {
  subject: string;
  previewText?: string;
  blocks: EmailBlock[];
  variables: Record<string, string>;
  branding: BrandingForRender & BrandingForText;
  signatureHtml?: string;
  signatureText?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  unresolvedVariables: string[];
  mjmlErrors: string[];
}

function interpolateBlocks(blocks: EmailBlock[], variables: Record<string, string>): EmailBlock[] {
  return blocks.map((block) => {
    switch (block.type) {
      case "heading":
        return { ...block, text: interpolateVariables(block.text, variables) };
      case "paragraph":
        return { ...block, html: interpolateVariables(block.html, variables) };
      case "button":
        return {
          ...block,
          text: interpolateVariables(block.text, variables),
          url: interpolateVariables(block.url, variables),
        };
      case "image":
        return {
          ...block,
          alt: interpolateVariables(block.alt, variables),
          href: block.href ? interpolateVariables(block.href, variables) : block.href,
        };
      case "list":
        return { ...block, items: block.items.map((i) => interpolateVariables(i, variables)) };
      case "table":
        return {
          ...block,
          headers: block.headers.map((h) => interpolateVariables(h, variables)),
          rows: block.rows.map((row) => row.map((cell) => interpolateVariables(cell, variables))),
        };
      default:
        return block;
    }
  });
}

// The single rendering pipeline used identically for browser preview, test
// send, and real send (Section 49) — callers differ only in what they do
// with the RenderedEmail, never in how it's produced.
export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const resolvedBlocks = interpolateBlocks(input.blocks, input.variables);
  const subject = interpolateVariables(input.subject, input.variables);
  const previewText = input.previewText ? interpolateVariables(input.previewText, input.variables) : undefined;

  const mjmlSource = compileDocumentToMjml(resolvedBlocks, input.branding, input.signatureHtml);
  const { html, errors } = mjml2html(mjmlSource, { validationLevel: "soft" });

  const htmlWithPreheader = previewText
    ? html.replace(
        /(<body[^>]*>)/,
        `$1<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>`
      )
    : html;

  const text = compileDocumentToText(resolvedBlocks, input.branding, input.signatureText);

  const unresolvedVariables = Array.from(
    new Set([...findUnresolvedVariables(subject), ...findUnresolvedVariables(html), ...findUnresolvedVariables(text)])
  );

  return {
    subject,
    html: htmlWithPreheader,
    text,
    unresolvedVariables,
    mjmlErrors: errors.map((e: { formattedMessage: string }) => e.formattedMessage),
  };
}
