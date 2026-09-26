import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AssignPermissionDto } from './assign-permission.dto';
import {
  BulkAssignMultipleModulesPermissionsToRoleByIdDto,
  BulkAssignPermissionsToRoleByIdDto,
} from './bulk-assign-permissions.dto';
import { BulkUpdatePermissionsDto } from './bulk-update-permissions.dto';
import { CreatepermissionsRolesDto } from './create-permission-role.dto';
import { RevokePermissionDto } from './revoke-permission.dto';

// Same options as main.ts / app.module.ts: whitelist strips every property without a validator.
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validate = (metatype: any, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });

const ROLE = '69cf7b3a-864c-44d7-8541-1ab57d34f49b';
const MENU = 'fd6a2bac-c8fe-4e91-9839-cd5a06fef078';
const PERM = 'd5d6de53-0734-44e5-ae49-d9057aecab23';

describe('DTOs de permisos con el ValidationPipe real (M-27)', () => {
  const valid: Array<[string, any, unknown]> = [
    ['AssignPermissionDto', AssignPermissionDto, { roleId: ROLE, menuSlug: 'patient', action: 'consultar', permissionId: PERM }],
    ['RevokePermissionDto', RevokePermissionDto, { roleId: ROLE, menuSlug: 'patient', action: 'consultar' }],
    ['BulkUpdatePermissionsDto', BulkUpdatePermissionsDto, { roleId: ROLE, permissions: [{ module: 'patient', action: 'crear', enabled: true }] }],
    ['BulkAssignPermissionsToRoleByIdDto', BulkAssignPermissionsToRoleByIdDto, { roleId: ROLE, moduleId: MENU, permissionIds: [PERM] }],
    [
      'BulkAssignMultipleModulesPermissionsToRoleByIdDto',
      BulkAssignMultipleModulesPermissionsToRoleByIdDto,
      { roleId: ROLE, permissions: [{ moduleId: MENU, permissionId: PERM, enabled: false }] },
    ],
    ['CreatepermissionsRolesDto', CreatepermissionsRolesDto, { roleId: ROLE, assignments: [{ permissionId: PERM, submenuId: MENU }] }],
  ];

  it.each(valid)('%s conserva todos los ids UUID (nada se descarta por whitelist)', async (_name, dto, body) => {
    const out = await validate(dto, body);
    expect(JSON.parse(JSON.stringify(out))).toEqual(body);
  });

  it.each(valid)('%s rechaza un roleId numérico con 400', async (_name, dto, body) => {
    await expect(validate(dto, { ...(body as object), roleId: 2 })).rejects.toThrow(BadRequestException);
  });

  it('rechaza ids no UUID dentro de los arreglos y objetos anidados', async () => {
    await expect(
      validate(BulkAssignPermissionsToRoleByIdDto, { roleId: ROLE, moduleId: MENU, permissionIds: ['1'] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      validate(BulkAssignMultipleModulesPermissionsToRoleByIdDto, {
        roleId: ROLE,
        permissions: [{ moduleId: 'menu-1', permissionId: PERM }],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      validate(AssignPermissionDto, { roleId: ROLE, menuSlug: 'patient', action: 'crear', permissionId: 7 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('exige menuSlug y action no vacíos', async () => {
    await expect(validate(RevokePermissionDto, { roleId: ROLE, menuSlug: '', action: 'crear' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(validate(AssignPermissionDto, { roleId: ROLE, menuSlug: 'patient' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
