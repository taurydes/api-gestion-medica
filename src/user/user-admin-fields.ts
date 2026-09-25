import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { RedisSessionService } from 'src/redis-session/redis-session.service';

/** Cambiar el rol de un usuario exige administrar roles (hoy solo `superusuario`). */
export const USER_ROLE_CHANGE_PERMISSION = `${ModuleItemsMenu.RoleModule}.${PermissionActionsMenu.UPDATE}`;
/** Activar o desactivar un usuario equivale a darlo de baja: exige `user.eliminar`. */
export const USER_STATUS_CHANGE_PERMISSION = `${ModuleItemsMenu.UserModule}.${PermissionActionsMenu.DELETE}`;

export interface AdminFieldChanges {
  fields: { roleId?: string; status?: boolean };
  /** El cambio desactiva al usuario: la sesión debe revocarse antes de persistir. */
  deactivates: boolean;
}

/** Regla común de PATCH /users y /users-security: `roleId`/`status` solo si cambian y el actor tiene permiso. */
export function resolveAdminFieldChanges(
  current: { roleId: string; status: boolean },
  requested: { roleId?: string; status?: boolean },
  actorPermissions: string[],
): AdminFieldChanges {
  const { roleId, status } = requested;
  const roleChanged = roleId !== undefined && roleId !== current.roleId;
  const statusChanged = status !== undefined && status !== current.status;

  if (roleChanged && !actorPermissions.includes(USER_ROLE_CHANGE_PERMISSION)) {
    throw new ForbiddenException(
      'No tiene permiso para cambiar el rol del usuario.',
    );
  }
  if (
    statusChanged &&
    !actorPermissions.includes(USER_STATUS_CHANGE_PERMISSION)
  ) {
    throw new ForbiddenException(
      'No tiene permiso para cambiar el estado del usuario.',
    );
  }

  const fields: AdminFieldChanges['fields'] = {};
  if (roleChanged) fields.roleId = roleId;
  if (statusChanged) fields.status = status;
  return { fields, deactivates: statusChanged && status === false };
}

/** Revoca la sesión en Redis; si falla, 503 reintentable para que el llamador no persista nada. */
export async function revokeSessionOrFail(
  redisSession: RedisSessionService,
  userId: string,
): Promise<void> {
  try {
    await redisSession.deleteSession(userId);
  } catch {
    throw new ServiceUnavailableException(
      'No se pudo cerrar la sesión del usuario. Intente nuevamente.',
    );
  }
}
