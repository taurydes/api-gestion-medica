import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { AuthUser } from 'src/auth/interfaces/User';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { ModuleItemsMenu } from 'src/menu/menu.const';

@ApiTags('Roles')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @ApiOperation({ summary: 'Crear rol' })
  @Permission(`${ModuleItemsMenu.RoleModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() dto: CreateRoleDto, @GetUser() currentUser: AuthUser) {
    return this.roleService.create(dto, currentUser);
  }

  @Get()
  @ApiOperation({ summary: 'Listar roles con paginación' })
  @Permission(`${ModuleItemsMenu.RoleModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: RoleQueryDto) {
    return this.roleService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener rol por ID' })
  @Permission(`${ModuleItemsMenu.RoleModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar rol' })
  @Permission(`${ModuleItemsMenu.RoleModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(+id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar rol' })
  @Permission(`${ModuleItemsMenu.RoleModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.roleService.remove(+id);
  }
}
