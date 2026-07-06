import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({
    description: 'Identificador do visitante gerado pelo tracker.js',
  })
  @IsString()
  @MinLength(1)
  visitorId!: string;

  @ApiPropertyOptional({
    description:
      'Identificador de sessão gerado pelo tracker.js; ausente/expirado é recuperado automaticamente pelo Session Manager',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({ example: 'Purchase' })
  @IsString()
  @MinLength(1)
  eventName!: string;

  @ApiProperty({
    enum: EventType,
    description: 'HEARTBEAT nunca gera uma linha em Event — só renova a sessão',
  })
  @IsString()
  eventType!: EventType;

  @ApiPropertyOptional({
    description: 'Chave de idempotência; gerado se ausente',
  })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referrerUrl?: string;

  @ApiPropertyOptional({
    description:
      'Atribuição — se ausente, o Attribution Engine usa o último touch conhecido do visitante',
  })
  @IsOptional()
  @IsString()
  utmSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmMedium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  utmContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fbclid?: string;

  @ApiPropertyOptional({ description: 'Exigido para forwarding ao Google Ads' })
  @IsOptional()
  @IsString()
  gclid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
