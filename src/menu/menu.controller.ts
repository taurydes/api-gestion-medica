import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { MenuService } from './menu.service';
import { MenuQueryDto } from './dto/menu-query.dto';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { ModuleItemsMenu } from './menu.const';

@ApiTags('Menu')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /**
   * @summary Crear menú.
   * @description Crea un nuevo registro de menú.
   */
  @ApiOperation({
    summary: 'Crear menú',
    description: 'Crea un nuevo menú con sus propiedades básicas.',
  })
  @Post()
  @Permission(`${ModuleItemsMenu.MenuModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createMenuDto: CreateMenuDto) {
    return this.menuService.create(createMenuDto);
  }

  /**
   * @summary Listar menús.
   * @description Retorna todos los menús disponibles (requiere permiso).
   */
  @ApiOperation({
    summary: 'Listar menús',
    description: 'Obtiene el listado completo de menús si el usuario tiene el permiso requerido.',
  })
  @Get()
  @Permission(`${ModuleItemsMenu.MenuModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: MenuQueryDto) {
    return this.menuService.findAll(query);
  }

  /**
   * @summary Obtener menú por ID.
   * @description Devuelve el detalle de un menú específico.
   */
  @ApiOperation({
    summary: 'Obtener menú',
    description: 'Recupera información de un menú usando su ID.',
  })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.MenuModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.menuService.findOne(+id);
  }

  /**
   * @summary Actualizar menú.
   * @description Modifica datos de un menú existente.
   */
  @ApiOperation({
    summary: 'Actualizar menú',
    description: 'Actualiza campos del menú identificado por su ID.',
  })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.MenuModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updateMenuDto: UpdateMenuDto) {
    return this.menuService.update(+id, updateMenuDto);
  }

  /**
   * @summary Eliminar menú.
   * @description Elimina (lógica o físicamente según implementación) un menú por ID.
   */
  @ApiOperation({
    summary: 'Eliminar menú',
    description: 'Elimina un menú existente usando su ID.',
  })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.MenuModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.menuService.remove(+id);
  }
}