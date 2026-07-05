import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { HashService } from './hash.service';

@Global()
@Module({
  providers: [EncryptionService, HashService],
  exports: [EncryptionService, HashService],
})
export class CryptoModule {}
