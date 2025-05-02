import { SetMetadata } from '@nestjs/common';

export const Permission = (permissions: string | string[]) =>
  SetMetadata('permissions', Array.isArray(permissions) ? permissions : [permissions]);