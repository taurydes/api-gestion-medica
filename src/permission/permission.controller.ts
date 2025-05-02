import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { PermissionService } from './permission.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { CreatePermissionsRoleDto } from './dto/create-permission-role.dto';
import { Permission } from 'src/auth/permission.decorator';

@ApiBearerAuth()
@ApiTags('Permissions')
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo permiso' })
  @Permission('crear permisos')
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
  remove(@Param('id') id: string) {
    return this.permissionService.remove(+id);
  }

  @Post('assign-to-role')
  @ApiOperation({ summary: 'Asignar permisos a un rol' })
  @ApiResponse({ status: 200, description: 'Permisos asignados correctamente' })
  @ApiResponse({ status: 404, description: 'Rol o permisos no encontrados' })
  assignPermissionsToRole(
    @Body() createPermissionsRoleDto: CreatePermissionsRoleDto,
  ) {
    return this.permissionService.assignPermissionsToRole(
      createPermissionsRoleDto,
    );
  }
}
