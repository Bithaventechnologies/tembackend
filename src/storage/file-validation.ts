import { BadRequestException } from "@nestjs/common";
import { fromBuffer as fileTypeFromBuffer } from "file-type";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_CSV_BYTES = 20 * 1024 * 1024; // 20MB

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Logos deliberately exclude SVG: SVG can embed <script>/event handlers and
// external references, so allowing raw SVG upload+render would reopen the
// exact XSS vector the block-editor's sanitizeInlineHtml() closes for
// paragraph content. Raster-only (png/jpeg/webp) keeps the render path safe
// without needing a separate SVG sanitizer.
export async function validateImageUpload(buffer: Buffer, declaredMimeType: string): Promise<string> {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new BadRequestException(`Image exceeds maximum size of ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
  }
  if (declaredMimeType === "image/svg+xml") {
    throw new BadRequestException("SVG uploads are not allowed for logos or signature images");
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
    throw new BadRequestException(
      "File content does not match an allowed image type (png, jpeg, webp) based on file signature",
    );
  }
  return detected.mime;
}

export async function validateCsvUpload(buffer: Buffer, declaredMimeType: string): Promise<void> {
  if (buffer.length > MAX_CSV_BYTES) {
    throw new BadRequestException(`CSV file exceeds maximum size of ${MAX_CSV_BYTES / 1024 / 1024}MB`);
  }
  const allowedDeclared = new Set(["text/csv", "application/vnd.ms-excel", "text/plain", "application/csv"]);
  if (!allowedDeclared.has(declaredMimeType)) {
    throw new BadRequestException("Invalid file type; expected a CSV file");
  }
  // CSV has no reliable magic-byte signature (it's plain text); file-type
  // returns undefined for text files, which we treat as acceptable here as
  // long as the declared mimetype matched and the content decodes as UTF-8 text.
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) {
    throw new BadRequestException("File content does not appear to be a plain-text CSV");
  }
}
