import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { CreatepermissionsRolesDto } from './dto/create-permission-role.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionActionsMenu } from './permission.const';
import { PermissionService } from './permission.service';
import { ModuleItemsMenu } from 'src/menu/menu.const';

@ApiTags('Permissions')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo permiso' })
  @Permission(`${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionService.create(createPermissionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los permisos' })
  @ApiResponse({
    status: 200,
    description: 'Lista de permisos.',
    type: [Permission],
  })
  @Permission(`${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.VIEW}`)
  findAll() {
    return this.permissionService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un permiso por ID' })
  @ApiParam({ name: 'id', description: 'ID del permiso', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'El permiso solicitado.',
    type: Permission,
  })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado.' })
  @Permission(`${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.permissionService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un permiso por ID' })
  @ApiParam({ name: 'id', description: 'ID del permiso', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'El permiso ha sido actualizado.',
    type: Permission,
  })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado.' })
  @Permission(`${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.UPDATE}`)
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionService.update(+id, updatePermissionDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un permiso por ID' })
  @ApiParam({ name: 'id', description: 'ID del permiso', example: 1 })
  @ApiResponse({ status: 200, description: 'El permiso ha sido eliminado.' })
  @ApiResponse({ status: 404, description: 'Permiso no encontrado.' })
  @Permission(`${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.permissionService.remove(+id);
  }

  @Post('assign-to-role')
  @ApiOperation({ summary: 'Asignar permisos a un rol' })
  @ApiResponse({ status: 200, description: 'Permisos asignados correctamente' })
  @ApiResponse({ status: 404, description: 'Rol o permisos no encontrados' })
  @Permission(`${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`)
  assignPermissionsToRole(
    @Body() createpermissionsRolesDto: CreatepermissionsRolesDto,
  ) {
    return this.permissionService.assignPermissionsToRole(
      createpermissionsRolesDto,
    );
  }

    @Post('roles/:roleId/assign-all')
  @ApiOperation({
    summary:
      'Asignar todos los permisos activos a un rol para todos los menús del sistema',
  })
  @ApiParam({ name: 'roleId', description: 'ID del rol', example: 1 })
  @Permission(
    `${ModuleItemsMenu.PermissionModule}.${PermissionActionsMenu.ASSIGN}`,
  )
  assignAllToRole(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.permissionService.assignAllPermissionsToRole(roleId);
  }
}
