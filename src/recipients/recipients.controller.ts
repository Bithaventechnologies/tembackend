import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { Recipient, RecipientList } from "@prisma/client";
import type { PaginatedResult } from "@email-platform/types";
import { RecipientsService } from "./recipients.service";
import {
  AddListMembersDto,
  CreateRecipientDto,
  CreateRecipientListDto,
  ImportRecipientsDto,
  UpdateRecipientDto,
} from "./dto/recipient.dto";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";
import { validateCsvUpload } from "../storage/file-validation";
import { AuditService } from "../audit/audit.service";

@Controller("recipients")
@UseGuards(CsrfGuard)
export class RecipientsController {
  constructor(
    private readonly recipientsService: RecipientsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<Recipient>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.recipientsService.list(
      user.organizationId,
      page,
      limit,
      query.search,
      query.status,
    );
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  @Get("export")
  async export(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const csv = await this.recipientsService.exportCsv(user.organizationId);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "recipients.export",
      resourceType: "Recipient",
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="recipients-export.csv"`);
    res.send(csv);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecipientDto): Promise<Recipient> {
    return this.recipientsService.create(user.organizationId, dto);
  }

  @Post("import/preview")
  @UseInterceptors(FileInterceptor("file"))
  async importPreview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    await validateCsvUpload(file.buffer, file.mimetype);
    return this.recipientsService.previewCsvImport(user.organizationId, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Post("import/confirm")
  confirmImport(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportRecipientsDto) {
    return this.recipientsService.confirmImport(user.organizationId, user.id, dto);
  }

  // --- Lists ---

  @Get("lists/all")
  listLists(@CurrentUser() user: AuthenticatedUser): Promise<RecipientList[]> {
    return this.recipientsService.listLists(user.organizationId);
  }

  @Post("lists")
  createList(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecipientListDto): Promise<RecipientList> {
    return this.recipientsService.createList(user.organizationId, dto);
  }

  @Get("lists/:id")
  getList(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<RecipientList> {
    return this.recipientsService.getList(user.organizationId, id);
  }

  @Delete("lists/:id")
  async removeList(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<{ deleted: true }> {
    await this.recipientsService.softDeleteList(user.organizationId, id);
    return { deleted: true };
  }

  @Post("lists/:id/members")
  addMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AddListMembersDto,
  ) {
    return this.recipientsService.addMembers(user.organizationId, id, dto.recipientIds);
  }

  @Delete("lists/:id/members/:recipientId")
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("recipientId") recipientId: string,
  ): Promise<{ removed: true }> {
    await this.recipientsService.removeMember(user.organizationId, id, recipientId);
    return { removed: true };
  }

  // NOTE: these generic :id routes must stay below the more specific
  // "export", "import/*" and "lists/*" routes above — Nest matches routes in
  // declaration order, and ":id" would otherwise swallow those paths.
  @Get(":id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Recipient> {
    return this.recipientsService.getOne(user.organizationId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateRecipientDto,
  ): Promise<Recipient> {
    return this.recipientsService.update(user.organizationId, id, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<{ deleted: true }> {
    await this.recipientsService.softDelete(user.organizationId, id);
    return { deleted: true };
  }
}
