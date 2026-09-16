import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { PaginatedResult } from "@email-platform/types";
import type { EmailMessage } from "@prisma/client";
import { FailedEmailsService } from "./failed-emails.service";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";

@Controller("failed-emails")
@UseGuards(CsrfGuard)
export class FailedEmailsController {
  constructor(private readonly failedEmailsService: FailedEmailsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
    @Query("failureType") failureType?: string,
    @Query("campaignId") campaignId?: string,
  ): Promise<PaginatedResult<EmailMessage>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.failedEmailsService.list(user.organizationId, page, limit, failureType, campaignId);
    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  @Post(":id/retry")
  retry(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.failedEmailsService.retry(user.organizationId, user.id, id);
  }
}
