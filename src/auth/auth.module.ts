import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
