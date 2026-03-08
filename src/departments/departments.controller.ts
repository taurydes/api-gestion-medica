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
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Departments')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @ApiOperation({
    summary: 'Crear departamento',
    description:
      'Registra un nuevo departamento médico asociado a un centro médico.',
  })
  @Post()
  @Permission(
    `${ModuleItemsMenu.DepartmentsModule}.${PermissionActionsMenu.CREATE}`,
  )
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  @ApiOperation({
    summary: 'Listar departamentos',
    description:
      'Retorna todos los departamentos médicos con paginación y filtros.',
  })
  @Get()
  @Permission(
    `${ModuleItemsMenu.DepartmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  findAll(@Query() query: DepartmentQueryDto) {
    return this.departmentsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Obtener departamento por ID',
    description:
      'Devuelve el detalle de un departamento con sus especialidades.',
  })
  @Get(':id')
  @Permission(
    `${ModuleItemsMenu.DepartmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  @ApiOperation({
    summary: 'Actualizar departamento',
    description: 'Modifica información de un departamento existente.',
  })
  @Patch(':id')
  @Permission(
    `${ModuleItemsMenu.DepartmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar departamento',
    description: 'Elimina lógicamente un departamento por ID.',
  })
  @Delete(':id')
  @Permission(
    `${ModuleItemsMenu.DepartmentsModule}.${PermissionActionsMenu.DELETE}`,
  )
  remove(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }
}
