import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class TemplateVariableInputDto {
  @IsString()
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/, { message: "Variable key must be a valid identifier" })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsIn(["RECIPIENT", "SYSTEM", "BRANDING", "CUSTOM"])
  source?: "RECIPIENT" | "SYSTEM" | "BRANDING" | "CUSTOM";
}

// `body` is the EmailDocument ({ blocks: EmailBlock[] }) from
// @email-platform/types email-blocks.ts — validated structurally here and
// re-validated against emailDocumentSchema (zod) in the service for the
// exact block-union shape, since class-validator can't express a
// discriminated union as cleanly as zod.
export class CreateTemplateDto {
  @IsString()
  categoryId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(["TRANSACTIONAL", "MARKETING"])
  classification?: "TRANSACTIONAL" | "MARKETING";

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  previewText?: string;

  @IsObject()
  body!: { blocks: unknown[] };

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableInputDto)
  variables?: TemplateVariableInputDto[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(["TRANSACTIONAL", "MARKETING"])
  classification?: "TRANSACTIONAL" | "MARKETING";

  @IsOptional()
  @IsIn(["DRAFT", "ACTIVE", "ARCHIVED"])
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  previewText?: string;

  @IsOptional()
  @IsObject()
  body?: { blocks: unknown[] };

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableInputDto)
  variables?: TemplateVariableInputDto[];
}

export class SendTestEmailDto {
  @IsEmail()
  toEmail!: string;

  @IsOptional()
  @IsObject()
  sampleVariables?: Record<string, string>;
}

export class PreviewTemplateDto {
  @IsOptional()
  @IsObject()
  sampleVariables?: Record<string, string>;
}
