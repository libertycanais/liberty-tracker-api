import { Injectable, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { Platform } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SetGa4CredentialDto } from './dto/set-ga4-credential.dto';
import { SetMetaCredentialDto } from './dto/set-meta-credential.dto';

export interface MetaCredentialPayload {
  pixelId: string;
  accessToken: string;
}

export interface Ga4CredentialPayload {
  measurementId: string;
  apiSecret: string;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async listForProject(workspaceId: string, projectId: string) {
    await this.assertOwnership(workspaceId, projectId);
    const credentials = await this.prisma.platformCredential.findMany({
      where: { projectId },
    });
    return credentials.map((credential) => ({
      platform: credential.platform,
      isActive: credential.isActive,
      lastVerifiedAt: credential.lastVerifiedAt,
      metaTestEventCode: credential.metaTestEventCode,
      updatedAt: credential.updatedAt,
    }));
  }

  async setMetaCredential(
    workspaceId: string,
    projectId: string,
    dto: SetMetaCredentialDto,
  ) {
    await this.assertOwnership(workspaceId, projectId);
    const payload: MetaCredentialPayload = {
      pixelId: dto.pixelId,
      accessToken: dto.accessToken,
    };
    await this.prisma.platformCredential.upsert({
      where: { projectId_platform: { projectId, platform: Platform.META } },
      create: {
        projectId,
        platform: Platform.META,
        encryptedPayload: this.encryptionService.encrypt(
          JSON.stringify(payload),
        ),
        metaTestEventCode: dto.testEventCode,
      },
      update: {
        encryptedPayload: this.encryptionService.encrypt(
          JSON.stringify(payload),
        ),
        metaTestEventCode: dto.testEventCode,
        isActive: true,
      },
    });
    return { platform: Platform.META, isActive: true };
  }

  async setGa4Credential(
    workspaceId: string,
    projectId: string,
    dto: SetGa4CredentialDto,
  ) {
    await this.assertOwnership(workspaceId, projectId);
    const payload: Ga4CredentialPayload = {
      measurementId: dto.measurementId,
      apiSecret: dto.apiSecret,
    };
    await this.prisma.platformCredential.upsert({
      where: { projectId_platform: { projectId, platform: Platform.GA4 } },
      create: {
        projectId,
        platform: Platform.GA4,
        encryptedPayload: this.encryptionService.encrypt(
          JSON.stringify(payload),
        ),
      },
      update: {
        encryptedPayload: this.encryptionService.encrypt(
          JSON.stringify(payload),
        ),
        isActive: true,
      },
    });
    return { platform: Platform.GA4, isActive: true };
  }

  async getDecryptedPayload<T>(
    projectId: string,
    platform: Platform,
  ): Promise<T | null> {
    const credential = await this.prisma.platformCredential.findUnique({
      where: { projectId_platform: { projectId, platform } },
    });
    if (!credential || !credential.isActive) {
      return null;
    }
    return JSON.parse(
      this.encryptionService.decrypt(credential.encryptedPayload),
    ) as T;
  }

  private async assertOwnership(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }
}
