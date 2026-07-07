import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import packageJson from '../../../package.json';

const PROCESS_STARTED_AT = new Date().toISOString();

@ApiTags('version')
@Controller('version')
export class VersionController {
  constructor(private readonly configService: ConfigService) {}

  @ApiOperation({
    summary:
      'Metadados de build/versão do serviço (version, commit, buildDate, environment, nodeVersion, apiVersion)',
  })
  @Get()
  get() {
    return {
      version: packageJson.version,
      apiVersion: 'v1',
      commit: this.configService.get<string>('GIT_COMMIT', 'unknown'),
      buildDate: this.configService.get<string>(
        'BUILD_DATE',
        PROCESS_STARTED_AT,
      ),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      nodeVersion: process.version,
    };
  }
}
