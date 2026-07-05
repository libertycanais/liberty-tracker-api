import { Type } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { EventType } from '../../../generated/prisma/enums';

export class CreateEventDto {
  @IsString()
  @MinLength(1)
  visitorId!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @MinLength(1)
  eventName!: string;

  @IsString()
  eventType!: EventType;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  referrerUrl?: string;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmTerm?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  @IsString()
  gclid?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
