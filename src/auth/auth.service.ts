import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const baseSlug = slugify(dto.workspaceName) || 'workspace';
    let slug = baseSlug;
    let suffix = 0;

    while (await this.prisma.workspace.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.workspaceName,
        slug,
        users: {
          create: {
            email: dto.email,
            passwordHash,
            name: dto.name,
            role: 'OWNER',
          },
        },
      },
      include: { users: true },
    });

    const user = workspace.users[0];
    return this.buildAuthResponse(
      user.id,
      workspace.id,
      user.role,
      user.email,
      user.name,
      workspace.name,
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: user.workspaceId },
    });
    return this.buildAuthResponse(
      user.id,
      user.workspaceId,
      user.role,
      user.email,
      user.name,
      workspace.name,
    );
  }

  private buildAuthResponse(
    userId: string,
    workspaceId: string,
    role: string,
    email: string,
    name: string | null,
    workspaceName: string,
  ) {
    const payload: JwtPayload = {
      sub: userId,
      workspaceId,
      role: role as JwtPayload['role'],
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: userId, email, name, role, workspaceId, workspaceName },
    };
  }
}
