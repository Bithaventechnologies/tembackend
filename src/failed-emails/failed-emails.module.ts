import { Module } from "@nestjs/common";
import { FailedEmailsService } from "./failed-emails.service";
import { FailedEmailsController } from "./failed-emails.controller";
import { QueueModule } from "../queue/queue.module";
import { CampaignsModule } from "../campaigns/campaigns.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [QueueModule, CampaignsModule, AuditModule],
  providers: [FailedEmailsService],
  controllers: [FailedEmailsController],
})
export class FailedEmailsModule {}
