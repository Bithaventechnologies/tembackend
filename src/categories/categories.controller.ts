import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { EmailCategory } from "@prisma/client";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CsrfGuard } from "../auth/guards/csrf.guard";

@Controller("categories")
@UseGuards(CsrfGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("includeInactive") includeInactive?: string,
  ): Promise<EmailCategory[]> {
    return this.categoriesService.list(user.organizationId, includeInactive === "true");
  }

  @Get(":id")
  getOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<EmailCategory> {
    return this.categoriesService.getOne(user.organizationId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto): Promise<EmailCategory> {
    return this.categoriesService.create(user.organizationId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<EmailCategory> {
    return this.categoriesService.update(user.organizationId, id, dto);
  }

  @Patch(":id/activate")
  activate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<EmailCategory> {
    return this.categoriesService.setActive(user.organizationId, id, true);
  }

  @Patch(":id/deactivate")
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<EmailCategory> {
    return this.categoriesService.setActive(user.organizationId, id, false);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<{ deleted: true }> {
    await this.categoriesService.softDelete(user.organizationId, id);
    return { deleted: true };
  }
}
