import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

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
