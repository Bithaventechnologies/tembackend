import { Module } from "@nestjs/common";
import { SignaturesService } from "./signatures.service";
import { SignaturesController } from "./signatures.controller";
import { StorageModule } from "../storage/storage.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [StorageModule, AuditModule],
  providers: [SignaturesService],
  controllers: [SignaturesController],
  exports: [SignaturesService],
})
export class SignaturesModule {}
