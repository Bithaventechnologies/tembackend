import {
  IsArray,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  templateId!: string;

  @IsOptional()
  @IsString()
  recipientListId?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  manualRecipientEmails?: string[];

  @IsOptional()
  @IsString()
  signatureId?: string;

  @IsOptional()
  @IsObject()
  customVariableOverrides?: Record<string, string>;
}

export class SendCampaignDto {
  @IsString()
  @MinLength(10)
  idempotencyKey!: string;

  @IsInt()
  @Min(0)
  confirmedRecipientCount!: number;
}
