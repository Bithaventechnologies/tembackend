import { VARIABLE_TOKEN_REGEX } from "@email-platform/types";

// Replaces {{key}} tokens with resolved values. Unresolved tokens are left
// as a visibly-marked placeholder rather than silently blanked, so a missing
// mapping is obvious in preview/test sends instead of shipping broken copy.
export function interpolateVariables(text: string, values: Record<string, string>): string {
  return text.replace(VARIABLE_TOKEN_REGEX, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key] ?? "";
    }
    return `[[missing:${key}]]`;
  });
}

export function findUnresolvedVariables(renderedText: string): string[] {
  const matches = renderedText.matchAll(/\[\[missing:([a-zA-Z_][a-zA-Z0-9_]*)\]\]/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1]).filter((k): k is string => !!k)));
}
