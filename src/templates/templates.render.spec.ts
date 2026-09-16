import { renderEmail } from "@email-platform/email";
import { extractVariableKeys, type EmailDocument } from "@email-platform/types";

// Covers "variable extraction/rendering with missing vars" from a
// consumer-of-the-pipeline point of view (as templates.service.ts uses it),
// without needing Nest DI or a database.
describe("template variable extraction + rendering with missing variables", () => {
  const doc: EmailDocument = {
    blocks: [
      { type: "heading", id: "h1", level: "h1", text: "Hi {{firstName}}", align: "left" },
      { type: "paragraph", id: "p1", html: "Your code is {{otpCode}}", align: "left" },
    ],
  };

  it("extracts all variable keys referenced in subject/previewText/blocks", () => {
    const keys = extractVariableKeys(doc, "Welcome {{firstName}}", "Preview for {{firstName}}");
    expect(keys.sort()).toEqual(["firstName", "otpCode"].sort());
  });

  it("marks variables missing from the supplied values as unresolved", () => {
    const result = renderEmail({
      subject: "Welcome {{firstName}}",
      blocks: doc.blocks,
      variables: { firstName: "Jane" }, // otpCode intentionally omitted
      branding: { companyName: "Acme", primaryColor: "#111827", secondaryColor: "#6366F1" },
    });

    expect(result.subject).toBe("Welcome Jane");
    expect(result.unresolvedVariables).toEqual(["otpCode"]);
    expect(result.mjmlErrors).toEqual([]);
  });
});
