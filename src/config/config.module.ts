import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import * as path from "node:path";
import { validateEnv } from "./env.validation";

// .env is located at the project root.
// This file is: src/config/config.module.ts
// ../../.env goes from src/config -> src -> project root
const ENV_FILE_PATH = path.resolve(__dirname, "../../.env");

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [ENV_FILE_PATH],
    }),
  ],
})
export class ConfigModule {}