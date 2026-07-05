import { IsString, MinLength } from 'class-validator';

export class SetGa4CredentialDto {
  @IsString()
  @MinLength(5)
  measurementId!: string;

  @IsString()
  @MinLength(5)
  apiSecret!: string;
}
