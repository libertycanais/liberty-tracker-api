import { IsNumberString, MinLength } from 'class-validator';

export class SetGoogleAdsCredentialDto {
  @IsNumberString()
  @MinLength(5)
  customerId!: string;

  @IsNumberString()
  @MinLength(1)
  conversionActionId!: string;
}
