import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class HashService {
  sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  generateApiKey(): string {
    return `ltk_live_${randomBytes(24).toString('hex')}`;
  }
}
