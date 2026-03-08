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
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Doctors')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @ApiOperation({
    summary: 'Crear doctor',
    description: 'Registra un nuevo doctor asociado a una persona común.',
  })
  @Post()
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() dto: CreateDoctorDto) {
    return this.doctorsService.create(dto);
  }

  @ApiOperation({
    summary: 'Listar doctores',
    description: 'Retorna todos los doctores con paginación y filtros.',
  })
  @Get()
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: DoctorQueryDto) {
    return this.doctorsService.findAll(query);
  }

  @ApiOperation({
    summary: 'Obtener doctor por ID',
    description: 'Devuelve el detalle de un doctor específico con su información personal.',
  })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.doctorsService.findOne(id);
  }

  @ApiOperation({
    summary: 'Actualizar doctor',
    description: 'Modifica información de un doctor existente.',
  })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctorsService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Eliminar doctor',
    description: 'Elimina lógicamente un doctor por ID.',
  })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.doctorsService.remove(id);
  }
}
