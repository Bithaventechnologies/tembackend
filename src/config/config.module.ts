import { Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import * as path from "node:path";
import { validateEnv } from "./env.validation";

// Commands are run from the repository root in local development and on Render.
// Unlike __dirname, process.cwd() does not move when TypeScript is compiled to dist/.
const ENV_FILE_PATH = path.resolve(process.cwd(), ".env");

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
