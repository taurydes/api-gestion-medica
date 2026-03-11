/**
 * @fileoverview Controlador para gestión dinámica de permisos CASL.
 *
 * Endpoints para:
 * - CRUD de permisos por rol
 * - Consulta de permisos de usuario
 * - Matriz de permisos para administración
 * - Verificación de permisos en tiempo real
 *
 * @example
 * // Obtener permisos del usuario actual:
 * GET /casl/permissions/me
 *
 * // Obtener matriz de permisos para administración:
 * GET /casl/permissions/matrix
 *
 * // Asignar permiso a rol:
 * POST /casl/permissions/assign
 * { "roleId": 1, "menuSlug": "Campaign", "action": "crear" }
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SessionGuard } from 'src/auth/guards/session.guard';
import { AuthUser } from 'src/auth/interfaces/User';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import {
  PermissionActionsMenu,
  PermissionToFront,
} from 'src/permission/permission.const';
import {
  AssignPermissionDto,
  BulkUpdatePermissionsDto,
  RevokePermissionDto,
  SuccessResponseDto,
} from '../dto';
import {
  BulkAssignMultipleModulesPermissionsToRoleByIdDto,
  BulkAssignMultipleModulesPermissionsToUserByIdDto,
  BulkAssignPermissionsResponseDto,
  BulkAssignPermissionsToRoleByIdDto,
  BulkAssignPermissionsToUserByIdDto,
} from '../dto/bulk-assign-permissions.dto';
import { PermissionService } from '../services/permission.service';
import { QueryPermissionDto } from '../dto/query-permission.dto';

// =============================================================================
// CONTROLLER
// =============================================================================

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SessionGuard)
@Throttle({ short: {} })
@Controller('permissions')
export class CaslPermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  // ===========================================================================
  // USER  AND ROLES PERMISSIONS
  // ===========================================================================

  /**
   * Obtiene los permisos del usuario actual (para frontend).
   */
  @Get('me')
  @ApiOperation({ summary: 'Obtener permisos del usuario actual' })
  @ApiResponse({
    status: 200,
    description: 'Permisos del usuario agrupados por módulo',
  })
  async getMyPermissions(
    @GetUser() user: AuthUser,
  ): Promise<PermissionToFront> {
    const userId = this.extractUserId(user);
    return this.permissionService.getUserPermissionsSummary(String(userId));
  }

  /**
   * Obtiene los permisos de un usuario específico (admin only).
   */
  @Get('user/:userId')
  @ApiOperation({ summary: 'Obtener permisos de un usuario específico' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.VIEW}`,
  )
  async getUserPermissions(
    @Param('userId') userId: string,
  ): Promise<PermissionToFront> {
    return this.permissionService.getUserPermissionsSummary(userId);
  }

  /**
   * Obtiene los permisos de un rol.
   */
  @Get('role/:roleId')
  @ApiOperation({ summary: 'Obtener permisos de un rol' })
  @ApiParam({ name: 'roleId', description: 'ID del rol' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.VIEW}`,
  )
  async getRolePermissions(@Param('roleId') roleId: string | number) {
    return this.permissionService.getMenusForUserAndRole(String(roleId));
  }

  /**
   * Obtiene los permisos de un rol.
   */
  @Get()
  @ApiOperation({ summary: 'Obtener todos los permisos' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.VIEW}`,
  )
  async findAllPermissions(@Query() pagination: QueryPermissionDto) {
    return this.permissionService.findAllPermissions(pagination);
  }

  // ===========================================================================
  // ROLE PERMISSIONS
  // ===========================================================================

  /**
   * Asigna un permiso a un rol.
   */
  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Asignar permiso a un rol' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`,
  )
  async assignPermission(
    @Body() dto: AssignPermissionDto,
    @GetUser() user: AuthUser,
  ) {
    return this.permissionService.assignPermissionToRole(dto, user);
  }

  /**
   * Revoca un permiso de un rol.
   */
  @Delete('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar permiso de un rol' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.DELETE}`,
  )
  @ApiResponse({ status: 200, type: SuccessResponseDto })
  async revokePermission(
    @Body() dto: RevokePermissionDto,
  ): Promise<SuccessResponseDto> {
    const success = await this.permissionService.revokePermissionFromRole(dto);
    return { success };
  }

  /**
   * Actualiza múltiples permisos de un rol.
   */
  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar múltiples permisos de un rol' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.UPDATE}`,
  )
  @ApiResponse({ status: 200, type: SuccessResponseDto })
  async bulkUpdatePermissions(
    @Body() dto: BulkUpdatePermissionsDto,
    @GetUser() user: AuthUser,
  ): Promise<SuccessResponseDto> {
    await this.permissionService.bulkUpdateRolePermissions(dto, user);
    return { success: true };
  }

  // =========================================================================
  // BULK ASSIGNMENT - ROLES
  // ===========================================================================

  /**
   * Asigna múltiples permisos (acciones) de múltiples módulos a un rol (por IDs).
   */
  @Post('bulk-assign/role/multiple-modules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Asignar múltiples permisos (por IDs) de múltiples módulos a un rol',
  })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`,
  )
  @ApiResponse({ status: 200, type: BulkAssignPermissionsResponseDto })
  async bulkAssignMultipleModulesPermissionsToRoleById(
    @Body() dto: BulkAssignMultipleModulesPermissionsToRoleByIdDto,
    @GetUser() user: AuthUser,
  ): Promise<BulkAssignPermissionsResponseDto> {
    const result =
      await this.permissionService.bulkAssignMultipleModulesPermissionsToRoleById(
        dto,
        user,
      );

    return {
      success: result.success,
      assignedCount: result.assignedCount,
      message: `${result.assignedCount} permisos asignados, ${result.revokedCount} revocados`,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  }

  /**
   * Asigna múltiples permisos (acciones) de un módulo a un rol (por IDs).
   */
  @Post('bulk-assign/role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Asignar múltiples permisos (por IDs) de un módulo a un rol',
  })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`,
  )
  @ApiResponse({ status: 200, type: BulkAssignPermissionsResponseDto })
  async bulkAssignPermissionsToRoleById(
    @Body() dto: BulkAssignPermissionsToRoleByIdDto,
    @GetUser() user: AuthUser,
  ): Promise<BulkAssignPermissionsResponseDto> {
    return await this.permissionService.bulkAssignPermissionsToRoleById(
      dto,
      user,
    );
  }

  // =========================================================================
  // BULK ASSIGNMENT - USERS
  // ===========================================================================

  /**
   * Asigna múltiples permisos de múltiples módulos a un usuario (por IDs).
   */
  @Post('bulk-assign/user/multiple-modules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Asignar múltiples permisos (por IDs) de múltiples módulos a un usuario',
  })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`,
  )
  @ApiResponse({ status: 200, type: BulkAssignPermissionsResponseDto })
  async bulkAssignMultipleModulesPermissionsToUserById(
    @Body() dto: BulkAssignMultipleModulesPermissionsToUserByIdDto,
  ): Promise<BulkAssignPermissionsResponseDto> {
    return await this.permissionService.bulkAssignMultipleModulesPermissionsToUserById(
      dto,
    );
  }

  /**
   * Asigna múltiples permisos (acciones) de un módulo a un usuario (por IDs).
   */
  @Post('bulk-assign/user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Asignar múltiples permisos (por IDs) de un módulo a un usuario',
  })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`,
  )
  @ApiResponse({ status: 200, type: BulkAssignPermissionsResponseDto })
  async bulkAssignPermissionsToUserById(
    @Body() dto: BulkAssignPermissionsToUserByIdDto,
  ): Promise<BulkAssignPermissionsResponseDto> {
    const result = await this.permissionService.bulkAssignPermissionsToUserById(
      dto.userId,
      dto.moduleId,
      dto.permissionIds,
    );

    return {
      success: result.success,
      assignedCount: result.assignedCount,
      message: `${result.assignedCount} permisos asignados al usuario (por ID)`,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  }
  // ===========================================================================
  // CACHE MANAGEMENT
  // ===========================================================================

  /**
   * Invalida el cache de permisos de un rol.
   */
  @Post('cache/invalidate/role/:roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidar cache de permisos de un rol' })
  @ApiParam({ name: 'roleId', description: 'ID del rol' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.DELETE}`,
  )
  async invalidateRoleCache(@Param('roleId') roleId: string | number) {
    await this.permissionService.invalidateRoleCache(roleId as any);
    return { success: true, message: `Cache invalidado para rol ${roleId}` };
  }

  /**
   * Invalida el cache de permisos de un usuario.
   */
  @Post('cache/invalidate/user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidar cache de permisos de un usuario' })
  @ApiParam({ name: 'userId', description: 'ID del usuario' })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.DELETE}`,
  )
  async invalidateUserCache(@Param('userId') userId: string | number) {
    await this.permissionService.invalidateUserCache(userId as any);
    return {
      success: true,
      message: `Cache invalidado para usuario ${userId}`,
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private extractUserId(user: AuthUser): string | number {
    if (typeof user === 'object' && user !== null && 'id' in user) {
      return (user as { id: string | number }).id;
    }
    throw new Error('Usuario no válido');
  }
}
