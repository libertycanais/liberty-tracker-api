import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CredentialsService } from './credentials.service';
import { SetGa4CredentialDto } from './dto/set-ga4-credential.dto';
import { SetGoogleAdsCredentialDto } from './dto/set-google-ads-credential.dto';
import { SetMetaCredentialDto } from './dto/set-meta-credential.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/credentials')
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.credentialsService.listForProject(user.workspaceId, projectId);
  }

  @Put('meta')
  setMeta(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SetMetaCredentialDto,
  ) {
    return this.credentialsService.setMetaCredential(
      user.workspaceId,
      projectId,
      dto,
    );
  }

  @Put('ga4')
  setGa4(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SetGa4CredentialDto,
  ) {
    return this.credentialsService.setGa4Credential(
      user.workspaceId,
      projectId,
      dto,
    );
  }

  @Put('google-ads')
  setGoogleAds(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SetGoogleAdsCredentialDto,
  ) {
    return this.credentialsService.setGoogleAdsCredential(
      user.workspaceId,
      projectId,
      dto,
    );
  }
}
