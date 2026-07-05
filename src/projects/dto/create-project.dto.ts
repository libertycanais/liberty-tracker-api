import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  waPhoneNumber?: string;

  @IsOptional()
  @IsString()
  waDefaultMessage?: string;

  @IsOptional()
  @IsString()
  domain?: string;
}
