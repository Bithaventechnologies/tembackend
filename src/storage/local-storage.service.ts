import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { StorageService, UploadInput, UploadResult } from "./storage.service";

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly rootDir: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    this.rootDir = path.resolve(this.config.get<string>("STORAGE_LOCAL_DIR", "./storage"));
    this.publicUrl = this.config.get<string>("STORAGE_PUBLIC_URL", "http://localhost:4000/uploads").replace(/\/$/, "");
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const ext = path.extname(input.originalName).toLowerCase();
    const key = `${input.folder}/${randomUUID()}${ext}`;
    const fullPath = path.join(this.rootDir, key);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.buffer);

    this.logger.log(`Stored file at ${key} (${input.buffer.length} bytes)`);

    return {
      key,
      url: this.getUrl(key),
      sizeBytes: input.buffer.length,
    };
  }

  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.rootDir, key);
    await fs.rm(fullPath, { force: true });
  }
}
