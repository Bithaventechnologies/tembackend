import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "./config/config.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { CategoriesModule } from "./categories/categories.module";
import { TemplatesModule } from "./templates/templates.module";
import { RecipientsModule } from "./recipients/recipients.module";
import { BrandingModule } from "./branding/branding.module";
import { SignaturesModule } from "./signatures/signatures.module";
import { StorageModule } from "./storage/storage.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { QueueModule } from "./queue/queue.module";
import { ResendModule } from "./resend/resend.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { FailedEmailsModule } from "./failed-emails/failed-emails.module";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    AuditModule,
    CategoriesModule,
    TemplatesModule,
    RecipientsModule,
    BrandingModule,
    SignaturesModule,
    StorageModule,
    ResendModule,
    QueueModule,
    CampaignsModule,
    WebhooksModule,
    AnalyticsModule,
    FailedEmailsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
