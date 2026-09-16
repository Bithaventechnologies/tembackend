import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { Campaign } from "@prisma/client";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto, SendCampaignDto } from "./dto/campaign.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";

@Controller("campaigns")
@UseGuards(CsrfGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status?: string): Promise<Campaign[]> {
    return this.campaignsService.list(user.organizationId, status);
  }

  @Get(":id")
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Query("recipientStatus") recipientStatus?: string,
  ) {
    return this.campaignsService.getDetail(user.organizationId, id, recipientStatus);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCampaignDto): Promise<Campaign> {
    return this.campaignsService.create(user.organizationId, user.id, dto);
  }

  @Post(":id/send")
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SendCampaignDto,
  ): Promise<Campaign> {
    return this.campaignsService.send(user.organizationId, user.id, id, dto);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<Campaign> {
    return this.campaignsService.cancel(user.organizationId, user.id, id);
  }
}
