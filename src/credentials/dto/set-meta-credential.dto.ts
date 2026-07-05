import { IsOptional, IsString, MinLength } from 'class-validator';

export class SetMetaCredentialDto {
  @IsString()
  @MinLength(5)
  pixelId!: string;

  @IsString()
  @MinLength(10)
  accessToken!: string;

  @IsOptional()
  @IsString()
  testEventCode?: string;
}
