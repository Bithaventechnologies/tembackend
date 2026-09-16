import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { EmailSignature, FileAsset } from "@prisma/client";
import { SignaturesService } from "./signatures.service";
import { CreateSignatureDto, UpdateSignatureDto } from "../branding/dto/branding.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.service";
import { validateImageUpload } from "../storage/file-validation";

@Controller("signatures")
@UseGuards(CsrfGuard)
export class SignaturesController {
  constructor(
    private readonly signaturesService: SignaturesService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<EmailSignature[]> {
    return this.signaturesService.list(user.organizationId);
  }

  @Get(":id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<EmailSignature> {
    return this.signaturesService.getOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSignatureDto): Promise<EmailSignature> {
    return this.signaturesService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateSignatureDto,
  ): Promise<EmailSignature> {
    return this.signaturesService.update(user.organizationId, user.id, id, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<{ deleted: true }> {
    await this.signaturesService.softDelete(user.organizationId, user.id, id);
    return { deleted: true };
  }

  @Post("image")
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<FileAsset> {
    if (!file) throw new BadRequestException("No file uploaded");
    const mimeType = await validateImageUpload(file.buffer, file.mimetype);

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType,
      folder: "signatures",
    });

    return this.prisma.fileAsset.create({
      data: {
        organizationId: user.organizationId,
        key: uploaded.key,
        url: uploaded.url,
        mimeType,
        sizeBytes: uploaded.sizeBytes,
        originalName: file.originalname,
      },
    });
  }
}
