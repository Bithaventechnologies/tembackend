import type { EmailBlock } from "@email-platform/types";
import { sanitizeInlineHtml } from "./sanitize";

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "heading": {
      const fontSize = block.level === "h1" ? "28px" : block.level === "h2" ? "22px" : "18px";
      return `<mj-text align="${block.align}" font-size="${fontSize}" font-weight="700" color="${
        block.color ?? "#111827"
      }" padding="12px 0">${escapeText(block.text)}</mj-text>`;
    }
    case "paragraph": {
      return `<mj-text align="${block.align}" font-size="15px" line-height="1.6" color="${
        block.color ?? "#374151"
      }" padding="8px 0">${sanitizeInlineHtml(block.html)}</mj-text>`;
    }
    case "button": {
      return `<mj-button align="${block.align}" href="${escapeAttr(block.url)}" background-color="${
        block.backgroundColor ?? "#4F46E5"
      }" color="${block.textColor ?? "#FFFFFF"}" border-radius="8px" font-weight="600" padding="16px 0">${escapeText(
        block.text
      )}</mj-button>`;
    }
    case "image": {
      const img = `<mj-image src="${escapeAttr(block.src)}" alt="${escapeAttr(block.alt)}" align="${
        block.align
      }" ${block.width ? `width="${block.width}px"` : ""} ${
        block.href ? `href="${escapeAttr(block.href)}"` : ""
      } padding="8px 0" />`;
      return img;
    }
    case "divider": {
      return `<mj-divider border-color="${block.color ?? "#E5E7EB"}" border-width="1px" padding="16px 0" />`;
    }
    case "spacer": {
      return `<mj-spacer height="${block.height}px" />`;
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items.map((item) => `<li>${escapeText(item)}</li>`).join("");
      return `<mj-text padding="8px 0" font-size="15px" color="#374151"><${tag} style="margin:0;padding-left:20px;">${items}</${tag}></mj-text>`;
    }
    case "table": {
      const headerRow = `<tr>${block.headers
        .map((h) => `<th style="text-align:left;padding:8px;border-bottom:2px solid #E5E7EB;">${escapeText(h)}</th>`)
        .join("")}</tr>`;
      const bodyRows = block.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeText(cell)}</td>`)
              .join("")}</tr>`
        )
        .join("");
      return `<mj-table padding="8px 0" font-size="14px" color="#374151">${headerRow}${bodyRows}</mj-table>`;
    }
    default:
      return "";
  }
}

export interface BrandingForRender {
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  footerText?: string;
  websiteUrl?: string;
  supportEmail?: string;
  address?: string;
}

export function compileDocumentToMjml(
  blocks: EmailBlock[],
  branding: BrandingForRender,
  signatureHtml?: string
): string {
  const bodyBlocks = blocks.map(renderBlock).join("\n");

  const logoSection = branding.logoUrl
    ? `<mj-section padding="24px 24px 8px 24px" background-color="#FFFFFF">
         <mj-column>
           <mj-image src="${branding.logoUrl}" alt="${escapeAttr(branding.companyName)}" width="140px" align="center" />
         </mj-column>
       </mj-section>`
    : "";

  const signatureSection = signatureHtml
    ? `<mj-section padding="16px 24px" background-color="#FFFFFF">
         <mj-column>
           <mj-divider border-color="#E5E7EB" border-width="1px" padding="0 0 16px 0" />
           <mj-text font-size="14px" color="#374151" line-height="1.6">${signatureHtml}</mj-text>
         </mj-column>
       </mj-section>`
    : "";

  const footerLines: string[] = [
    branding.companyName,
    [branding.supportEmail, branding.websiteUrl].filter((v): v is string => !!v).join(" | "),
    branding.address,
    branding.footerText,
  ].filter((line): line is string => !!line);

  return `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F3F4F6" width="600px">
    ${logoSection}
    <mj-section padding="24px" background-color="#FFFFFF">
      <mj-column>
        ${bodyBlocks}
      </mj-column>
    </mj-section>
    ${signatureSection}
    <mj-section padding="20px 24px">
      <mj-column>
        <mj-text align="center" font-size="12px" color="#9CA3AF" line-height="1.6">
          ${footerLines.map(escapeText).join("<br/>")}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`.trim();
}
