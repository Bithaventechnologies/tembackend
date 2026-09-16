import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EMAIL_SEND_QUEUE } from "./queue.constants";
import { buildRedisConnectionOptions } from "./redis-connection";

// Registers the BullMQ connection + the email-send queue for producers
// (CampaignsService enqueues here). The worker process (worker.main.ts)
// registers its own consumer (EmailSendProcessor, see worker.module.ts)
// against the same queue name/connection.
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: buildRedisConnectionOptions(config.getOrThrow<string>("REDIS_URL")),
      }),
    }),
    BullModule.registerQueue({ name: EMAIL_SEND_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
