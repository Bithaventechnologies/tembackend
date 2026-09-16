import { Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateRecipientDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;
}

export class UpdateRecipientDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;

  @IsOptional()
  @IsIn(["ACTIVE", "INVALID", "BOUNCED", "UNSUBSCRIBED", "SUPPRESSED"])
  status?: "ACTIVE" | "INVALID" | "BOUNCED" | "UNSUBSCRIBED" | "SUPPRESSED";
}

export class CreateRecipientListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class AddListMembersDto {
  @IsArray()
  @IsString({ each: true })
  recipientIds!: string[];
}

export class CsvColumnMappingDto {
  @IsString()
  csvHeader!: string;

  @IsOptional()
  @IsString()
  mappedTo!: string | null;
}

export class ImportRecipientsDto {
  @IsString()
  fileAssetId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CsvColumnMappingDto)
  columnMappings!: CsvColumnMappingDto[];

  @IsOptional()
  @IsString()
  targetListId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  newListName?: string;
}
