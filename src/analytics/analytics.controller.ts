import { Controller, Get, Param, Query } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("dashboard")
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.analyticsService.dashboard(
      user.organizationId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined,
    );
  }

  @Get("campaigns/:id")
  campaignAnalytics(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.analyticsService.campaignAnalytics(user.organizationId, id);
  }
}
