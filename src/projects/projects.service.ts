import { Injectable, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { HashService } from '../crypto/hash.service';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils/slugify';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async findAllForWorkspace(workspaceId: string) {
    const projects = await this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { credentials: true, _count: { select: { events: true } } },
    });
    return projects.map((project) => this.serialize(project));
  }

  async findOneScoped(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      include: { credentials: true, _count: { select: { events: true } } },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return this.serialize(project);
  }

  async create(workspaceId: string, dto: CreateProjectDto) {
    const baseSlug = slugify(dto.slug ?? dto.name) || 'project';
    let slug = baseSlug;
    let suffix = 0;

    while (
      await this.prisma.project.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
      })
    ) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const rawApiKey = this.hashService.generateApiKey();

    const project = await this.prisma.project.create({
      data: {
        workspaceId,
        name: dto.name,
        slug,
        apiKeyHash: this.hashService.sha256Hex(rawApiKey),
        apiKeyEncrypted: this.encryptionService.encrypt(rawApiKey),
        waPhoneNumber: dto.waPhoneNumber,
        waDefaultMessage: dto.waDefaultMessage,
        domain: dto.domain,
      },
      include: { credentials: true, _count: { select: { events: true } } },
    });

    return this.serialize(project);
  }

  async update(workspaceId: string, projectId: string, dto: UpdateProjectDto) {
    await this.assertOwnership(workspaceId, projectId);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: dto,
      include: { credentials: true, _count: { select: { events: true } } },
    });
    return this.serialize(project);
  }

  async rotateApiKey(workspaceId: string, projectId: string) {
    await this.assertOwnership(workspaceId, projectId);
    const rawApiKey = this.hashService.generateApiKey();
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        apiKeyHash: this.hashService.sha256Hex(rawApiKey),
        apiKeyEncrypted: this.encryptionService.encrypt(rawApiKey),
      },
      include: { credentials: true, _count: { select: { events: true } } },
    });
    return this.serialize(project);
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

  private serialize(project: {
    apiKeyEncrypted: string;
    apiKeyHash: string;
    credentials?: { encryptedPayload: string; [key: string]: unknown }[];
    [key: string]: unknown;
  }) {
    const rest: Record<string, unknown> = { ...project };
    delete rest.apiKeyEncrypted;
    delete rest.apiKeyHash;
    if (project.credentials) {
      rest.credentials = project.credentials.map((credential) => {
        const sanitized: Record<string, unknown> = { ...credential };
        delete sanitized.encryptedPayload;
        return sanitized;
      });
    }
    return {
      ...rest,
      apiKey: this.encryptionService.decrypt(project.apiKeyEncrypted),
    };
  }
}
