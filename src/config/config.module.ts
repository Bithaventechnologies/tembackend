import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import * as path from "node:path";
import { validateEnv } from "./env.validation";

// Resolved relative to this file (not process.cwd()) so config loads
// correctly regardless of which directory the process is started from.
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
