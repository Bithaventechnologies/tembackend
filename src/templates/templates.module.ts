import { Module } from "@nestjs/common";
import { TemplatesService } from "./templates.service";
import { TemplatesController } from "./templates.controller";
import { BrandingModule } from "../branding/branding.module";
import { SignaturesModule } from "../signatures/signatures.module";
import { ResendModule } from "../resend/resend.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [BrandingModule, SignaturesModule, ResendModule, AuditModule],
  providers: [TemplatesService],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
