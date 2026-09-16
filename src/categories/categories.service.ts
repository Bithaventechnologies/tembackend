import { Injectable } from "@nestjs/common";
import type { EmailCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ConflictApiException, NotFoundApiException } from "../common/exceptions/api.exceptions";
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, includeInactive: boolean): Promise<EmailCategory[]> {
    return this.prisma.emailCategory.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: "asc" },
    });
  }

  async getOne(organizationId: string, id: string): Promise<EmailCategory> {
    const category = await this.prisma.emailCategory.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!category) throw new NotFoundApiException("Category");
    return category;
  }

  async create(organizationId: string, dto: CreateCategoryDto): Promise<EmailCategory> {
    const baseSlug = slugify(dto.name);
    let slug = baseSlug;
    let suffix = 1;
    // Ensure uniqueness within org without relying on DB retry loops.
    while (await this.prisma.emailCategory.findFirst({ where: { organizationId, slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    return this.prisma.emailCategory.create({
      data: {
        organizationId,
        name: dto.name,
        slug,
        description: dto.description,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateCategoryDto): Promise<EmailCategory> {
    await this.getOne(organizationId, id);

    if (dto.name) {
      const baseSlug = slugify(dto.name);
      const existing = await this.prisma.emailCategory.findFirst({
        where: { organizationId, slug: baseSlug, NOT: { id } },
      });
      if (existing) throw new ConflictApiException("A category with a similar name already exists");
    }

    return this.prisma.emailCategory.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
        ...(dto.name ? { slug: slugify(dto.name) } : {}),
      },
    });
  }

  async setActive(organizationId: string, id: string, isActive: boolean): Promise<EmailCategory> {
    await this.getOne(organizationId, id);
    return this.prisma.emailCategory.update({ where: { id }, data: { isActive } });
  }

  async softDelete(organizationId: string, id: string): Promise<void> {
    await this.getOne(organizationId, id);
    await this.prisma.emailCategory.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }
}
