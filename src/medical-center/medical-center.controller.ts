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
import { MedicalCenterService } from './medical-center.service';
import { CreateMedicalCenterDto } from './dto/create-medical-center.dto';
import { UpdateMedicalCenterDto } from './dto/update-medical-center.dto';
import { MedicalCenterQueryDto } from './dto/medical-center-query.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Medical Centers')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('medical-centers')
export class MedicalCenterController {
  constructor(private readonly medicalCenterService: MedicalCenterService) {}

  @ApiOperation({
    summary: 'Crear centro médico',
    description: 'Registra un nuevo centro médico en el sistema.',
  })
  @Post()
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.CREATE}`,
  )
  create(@Body() dto: CreateMedicalCenterDto) {
    return this.medicalCenterService.create(dto);
  }

  @ApiOperation({
    summary: 'Listar centros médicos',
    description: 'Retorna todos los centros médicos con paginación y filtros.',
  })
  @Get()
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.VIEW}`,
  )
  findAll(@Query() query: MedicalCenterQueryDto) {
    return this.medicalCenterService.findAll(query);
  }

  @ApiOperation({
    summary: 'Obtener centro médico por ID',
    description: 'Devuelve el detalle de un centro médico específico.',
  })
  @Get(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.VIEW}`,
  )
  findOne(@Param('id') id: string) {
    return this.medicalCenterService.findOne(id);
  }

  @ApiOperation({
    summary: 'Actualizar centro médico',
    description: 'Modifica información de un centro médico existente.',
  })
  @Patch(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.UPDATE}`,
  )
  update(@Param('id') id: string, @Body() dto: UpdateMedicalCenterDto) {
    return this.medicalCenterService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar centro médico',
    description: 'Elimina lógicamente un centro médico por ID.',
  })
  @Delete(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.DELETE}`,
  )
  remove(@Param('id') id: string) {
    return this.medicalCenterService.remove(id);
  }
  @ApiOperation({
    summary: 'Asignar doctor a centro médico',
    description: 'Asigna un doctor existente a un centro médico.',
  })
  @Post(':id/assign-doctor/:doctorId')
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.UPDATE}`,
  )
  assignDoctor(
    @Param('id') id: string,
    @Param('doctorId') doctorId: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.medicalCenterService.assignDoctor(
      id,
      doctorId,
      departmentId || undefined,
    );
  }

  @ApiOperation({
    summary: 'Remover doctor de centro médico',
    description: 'Elimina la asignación de un doctor a un centro médico.',
  })
  @Delete(':id/remove-doctor/:doctorId')
  @Permission(
    `${ModuleItemsMenu.MedicalCenterModule}.${PermissionActionsMenu.UPDATE}`,
  )
  removeDoctor(@Param('id') id: string, @Param('doctorId') doctorId: string) {
    return this.medicalCenterService.removeDoctor(id, doctorId);
  }
}
