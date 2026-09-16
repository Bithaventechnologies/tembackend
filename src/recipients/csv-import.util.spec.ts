import { parseCsvBuffer, validateCsvRows } from "./csv-import.util";

describe("csv-import.util", () => {
  it("flags invalid emails, in-file duplicates, duplicates against existing recipients, and empty rows", () => {
    const csv = [
      "email,firstName",
      "jane@example.com,Jane",
      "not-an-email,Bob",
      "jane@example.com,Jane2",
      ",",
      "existing@example.com,Existing",
    ].join("\n");

    const parsed = parseCsvBuffer(Buffer.from(csv, "utf-8"));
    const summary = validateCsvRows(parsed, "email", new Set(["existing@example.com"]));

    expect(summary.totalRows).toBe(5);
    expect(summary.headers).toEqual(["email", "firstName"]);

    const rows = summary.sampleRows;
    expect(rows[0]).toMatchObject({ email: "jane@example.com", isValidEmail: true, isDuplicateInFile: false, isEmptyRow: false });
    expect(rows[1]).toMatchObject({ email: "not-an-email", isValidEmail: false });
    expect(rows[2]).toMatchObject({ email: "jane@example.com", isValidEmail: true, isDuplicateInFile: true });
    expect(rows[3]).toMatchObject({ isEmptyRow: true });
    expect(rows[4]).toMatchObject({ email: "existing@example.com", isValidEmail: true, isDuplicateInFile: true });

    expect(summary.validEmails).toBe(1);
    expect(summary.invalidEmails).toBe(1);
    expect(summary.duplicates).toBe(2);
    expect(summary.missingEmail).toBe(1);
  });

  it("handles a file with no rows", () => {
    const parsed = parseCsvBuffer(Buffer.from("email,firstName\n", "utf-8"));
    const summary = validateCsvRows(parsed, "email", new Set());
    expect(summary.totalRows).toBe(0);
    expect(summary.validEmails).toBe(0);
  });
});
