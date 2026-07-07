import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MaxJsonSize } from '../../common/validators/max-json-size.decorator';
import { EventType } from '../../../generated/prisma/enums';

const METADATA_MAX_BYTES = 10 * 1024;

export class CreateEventDto {
  @ApiProperty({
    description: 'Identificador do visitante gerado pelo tracker.js',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  visitorId!: string;

  @ApiPropertyOptional({
    description:
      'Identificador de sessão gerado pelo tracker.js; ausente/expirado é recuperado automaticamente pelo Session Manager',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionId?: string;

  @ApiProperty({ example: 'Purchase' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
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
  @MaxLength(200)
  eventId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrerUrl?: string;

  @ApiPropertyOptional({
    description:
      'Atribuição — se ausente, o Attribution Engine usa o último touch conhecido do visitante',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmMedium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmCampaign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmTerm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  utmContent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fbclid?: string;

  @ApiPropertyOptional({ description: 'Exigido para forwarding ao Google Ads' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  gclid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  @MaxJsonSize(METADATA_MAX_BYTES)
  metadata?: Record<string, unknown>;
}
