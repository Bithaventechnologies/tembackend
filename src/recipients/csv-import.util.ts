import { parse } from "csv-parse/sync";
import type { CsvImportSummary, CsvValidationRow } from "@email-platform/types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export function parseCsvBuffer(buffer: Buffer): ParsedCsv {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: false,
    trim: true,
    bom: true,
  }) as Array<Record<string, string>>;

  const headers = records.length > 0 ? Object.keys(records[0] as Record<string, string>) : [];
  return { headers, rows: records };
}

// Pure validation used for both the CSV preview endpoint and unit tests —
// takes parsed rows + the header mapped to "email" and flags: invalid email,
// in-file duplicates, empty rows, without touching the database (so
// "duplicates against existing recipients" is layered on by the caller,
// which has DB access).
export function validateCsvRows(
  parsed: ParsedCsv,
  emailHeader: string | undefined,
  existingEmails: Set<string>,
): CsvImportSummary {
  const seenInFile = new Set<string>();
  const validationRows: CsvValidationRow[] = [];

  let validEmails = 0;
  let invalidEmails = 0;
  let duplicates = 0;
  let missingEmail = 0;

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 for header row
    const values = Object.values(row).map((v) => (v ?? "").trim());
    const isEmptyRow = values.every((v) => v.length === 0);

    const rawEmail = emailHeader ? row[emailHeader]?.trim() : undefined;
    const email = rawEmail && rawEmail.length > 0 ? rawEmail.toLowerCase() : null;

    let isValidEmail = false;
    let isDuplicateInFile = false;

    if (isEmptyRow) {
      missingEmail += 1;
    } else if (!email) {
      missingEmail += 1;
    } else {
      isValidEmail = EMAIL_REGEX.test(email);
      if (!isValidEmail) {
        invalidEmails += 1;
      } else {
        isDuplicateInFile = seenInFile.has(email) || existingEmails.has(email);
        seenInFile.add(email);
        if (isDuplicateInFile) {
          duplicates += 1;
        } else {
          validEmails += 1;
        }
      }
    }

    validationRows.push({
      rowNumber,
      data: row,
      email,
      isValidEmail,
      isDuplicateInFile,
      isEmptyRow,
    });
  });

  return {
    totalRows: parsed.rows.length,
    validEmails,
    invalidEmails,
    duplicates,
    missingEmail,
    headers: parsed.headers,
    sampleRows: validationRows,
  };
}
