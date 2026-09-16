import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { EmailBranding, FileAsset } from "@prisma/client";
import { BrandingService } from "./branding.service";
import { UpdateBrandingDto } from "./dto/branding.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../storage/storage.service";
import { Inject } from "@nestjs/common";
import { validateImageUpload } from "../storage/file-validation";

@Controller("branding")
@UseGuards(CsrfGuard)
export class BrandingController {
  constructor(
    private readonly brandingService: BrandingService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<EmailBranding> {
    return this.brandingService.getOrCreateDefault(user.organizationId);
  }

  @Post()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBrandingDto,
  ): Promise<EmailBranding> {
    return this.brandingService.update(user.organizationId, user.id, dto);
  }

  @Post("logo")
  @UseInterceptors(FileInterceptor("file"))
  async uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<FileAsset> {
    if (!file) throw new BadRequestException("No file uploaded");
    const mimeType = await validateImageUpload(file.buffer, file.mimetype);

    const uploaded = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType,
      folder: "logos",
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
