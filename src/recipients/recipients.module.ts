import { Module } from "@nestjs/common";
import { RecipientsService } from "./recipients.service";
import { RecipientsController } from "./recipients.controller";
import { StorageModule } from "../storage/storage.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [StorageModule, AuditModule],
  providers: [RecipientsService],
  controllers: [RecipientsController],
  exports: [RecipientsService],
})
export class RecipientsModule {}
