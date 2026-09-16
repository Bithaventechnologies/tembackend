// Storage abstraction shaped so a local-disk implementation can be swapped
// for an S3-compatible one (STORAGE_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY
// are already in .env.example for that future driver) without touching callers.
export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  // Logical folder, e.g. "logos", "signatures", "csv-imports".
  folder: string;
}

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface StorageService {
  upload(input: UploadInput): Promise<UploadResult>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");
