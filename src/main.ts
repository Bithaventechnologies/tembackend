import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import * as express from "express";
import * as path from "node:path";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";

const RAW_BODY_ROUTE = "/webhooks/resend";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // Raw body must be captured BEFORE JSON parsing consumes the stream, and
  // ONLY for the webhook route — every other route gets normal JSON parsing.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        if (req.url === RAW_BODY_ROUTE) {
          (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
        }
      },
    }),
  );

  const corsOrigin = config.get<string>("API_CORS_ORIGIN", "http://localhost:3000");
  app.enableCors({
    origin: corsOrigin.split(",").map((o) => o.trim()),
    credentials: true,
  });

  const storageLocalDir = path.resolve(config.get<string>("STORAGE_LOCAL_DIR", "./storage"));
  app.use("/uploads", express.static(storageLocalDir));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const port = config.get<number>("API_PORT") ?? (process.env.PORT ? Number(process.env.PORT) : 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap();
