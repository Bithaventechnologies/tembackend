import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { EmailTemplate, TemplateVersion } from "@prisma/client";
import { TemplatesService } from "./templates.service";
import {
  CreateTemplateDto,
  PreviewTemplateDto,
  SendTestEmailDto,
  UpdateTemplateDto,
} from "./dto/template.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";

@Controller("templates")
@UseGuards(CsrfGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("categoryId") categoryId?: string,
    @Query("status") status?: string,
  ): Promise<EmailTemplate[]> {
    return this.templatesService.list(user.organizationId, categoryId, status);
  }

  @Get(":id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.templatesService.getOne(user.organizationId, id);
  }

  @Get(":id/versions")
  listVersions(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<TemplateVersion[]> {
    return this.templatesService.listVersions(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTemplateDto): Promise<EmailTemplate> {
    return this.templatesService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<EmailTemplate> {
    return this.templatesService.update(user.organizationId, user.id, id, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<{ deleted: true }> {
    await this.templatesService.softDelete(user.organizationId, user.id, id);
    return { deleted: true };
  }

  @Post(":id/preview")
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: PreviewTemplateDto,
  ) {
    return this.templatesService.preview(user.organizationId, id, dto.sampleVariables ?? {});
  }

  @Post(":id/send-test")
  sendTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SendTestEmailDto,
  ) {
    return this.templatesService.sendTest(user.organizationId, user.id, id, dto);
  }

  @Post("extract-variables")
  extractVariables(
    @Body() dto: { body: { blocks: unknown[] }; subject: string; previewText?: string },
  ): { variables: string[] } {
    return { variables: this.templatesService.extractVariables(dto.body, dto.subject, dto.previewText) };
  }
}
