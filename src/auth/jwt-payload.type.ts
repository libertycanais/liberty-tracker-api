import { WorkspaceRole } from '../../generated/prisma/enums';

export interface JwtPayload {
  sub: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export interface AuthenticatedUser {
  id: string;
  workspaceId: string;
  role: WorkspaceRole;
  email: string;
}
