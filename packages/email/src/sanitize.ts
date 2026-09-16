import sanitizeHtml from "sanitize-html";

// Inline rich-text fields (paragraph blocks) allow only a narrow, email-safe
// subset of formatting. Everything else (scripts, styles, iframes, on*
// handlers) is stripped so admin-authored content can never inject arbitrary
// HTML into an outbound email or the preview iframe.
export function sanitizeInlineHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["b", "strong", "i", "em", "u", "a", "br", "span"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["style"],
    },
    allowedStyles: {
      span: {
        color: [/^#[0-9A-Fa-f]{3,6}$/],
        "font-weight": [/^bold$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}
