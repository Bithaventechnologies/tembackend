import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";

// Standalone worker process — run via `pnpm --filter api run worker`.
// Keeps BullMQ job processing out of the HTTP request/response path
// entirely, so a slow/blocked send never affects API responsiveness.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const logger = new Logger("Worker");
  logger.log("Email-send worker started");

  const shutdown = async () => {
    logger.log("Shutting down worker...");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Worker failed to start", error);
  process.exit(1);
});
