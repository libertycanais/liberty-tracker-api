import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateTrackerConfigDto {
  @ApiPropertyOptional({
    description: 'Minutos de inatividade até a sessão expirar',
    default: 30,
    minimum: 1,
    maximum: 1440,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({
    description: 'Intervalo entre heartbeats enviados pelo tracker.js',
    default: 15,
    minimum: 5,
    maximum: 300,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  heartbeatIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Whitelist de eventName; vazio = todos permitidos',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  allowedEvents?: string[];

  @ApiPropertyOptional({
    description: 'Blacklist de eventName; tem prioridade sobre allowedEvents',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  blockedEvents?: string[];

  @ApiPropertyOptional({
    description: 'Domínios adicionais permitidos, além de Project.domain',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedDomains?: string[];
}
