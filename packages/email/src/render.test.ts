import { describe, expect, it } from "vitest";
import { renderEmail } from "./render";

describe("renderEmail", () => {
  it("interpolates variables and produces email-safe html + text", () => {
    const result = renderEmail({
      subject: "Hello {{firstName}}",
      previewText: "A quick note for {{firstName}}",
      blocks: [
        { type: "heading", id: "h1", level: "h1", text: "Welcome {{firstName}}", align: "left" },
        {
          type: "paragraph",
          id: "p1",
          html: "Dear {{firstName}} from {{company}}, thanks for reaching out.",
          align: "left",
        },
        { type: "button", id: "b1", text: "View Request", url: "https://example.com/{{referenceNumber}}", align: "center" },
        { type: "divider", id: "d1" },
      ],
      variables: { firstName: "Jane", company: "Acme Ltd" },
      branding: {
        companyName: "Acme Inc",
        primaryColor: "#111827",
        secondaryColor: "#6366F1",
        websiteUrl: "https://acme.example",
        supportEmail: "support@acme.example",
      },
    });

    expect(result.subject).toBe("Hello Jane");
    expect(result.html).toContain("Welcome Jane");
    expect(result.html).toContain("Acme Ltd");
    expect(result.text).toContain("WELCOME JANE");
    expect(result.unresolvedVariables).toEqual(["referenceNumber"]);
    expect(result.mjmlErrors).toEqual([]);
  });
});
