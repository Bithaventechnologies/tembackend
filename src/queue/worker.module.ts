import { Module } from "@nestjs/common";
import { QueueModule } from "./queue.module";
import { EmailSendProcessor } from "./email-send.processor";
import { ResendModule } from "../resend/resend.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SuppressionService } from "../campaigns/suppression.service";
import { ConfigModule } from "../config/config.module";

// Deliberately does NOT import CampaignsModule (which would also pull in
// BrandingModule/SignaturesModule/the HTTP controller stack) — the worker
// only needs SuppressionService, so it's provided directly here to keep the
// worker process lean and free of circular imports with QueueModule.
@Module({
  imports: [ConfigModule, PrismaModule, QueueModule, ResendModule],
  providers: [EmailSendProcessor, SuppressionService],
})
export class WorkerModule {}
