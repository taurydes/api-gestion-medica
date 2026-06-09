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
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { DoctorQueryDto } from './dto/doctor-query.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { DoctorScheduleService } from './doctor-schedule.service';
import {
  CreateDoctorScheduleDto,
  UpdateDoctorScheduleBlockDto,
} from './dto/doctor-schedule.dto';

@ApiTags('Doctors')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('doctors')
export class DoctorsController {
  constructor(
    private readonly doctorsService: DoctorsService,
    private readonly scheduleService: DoctorScheduleService,
  ) {}

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
  findAll(@Query() query: DoctorQueryDto, @GetUser() authUser: any) {
    return this.doctorsService.findAll(query, authUser);
  }

  @ApiOperation({
    summary: 'Obtener doctor por ID',
    description: 'Devuelve el detalle de un doctor específico con su información personal.',
  })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string, @GetUser() authUser: any) {
    return this.doctorsService.findOne(id, authUser);
  }

  @ApiOperation({
    summary: 'Actualizar doctor',
    description: 'Modifica información de un doctor existente.',
  })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() dto: UpdateDoctorDto, @GetUser() authUser: any) {
    return this.doctorsService.update(id, dto, authUser);
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

  // ======================================================
  // 🔹 HORARIOS DE DOCTORES
  // ======================================================

  @ApiOperation({
    summary: 'Configurar horarios de un doctor',
    description: 'Crea o reemplaza todos los horarios de un doctor en un centro médico.',
  })
  @Post('schedules')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.UPDATE}`)
  setSchedule(@Body() dto: CreateDoctorScheduleDto) {
    return this.scheduleService.setSchedule(dto);
  }

  @ApiOperation({
    summary: 'Obtener horarios de un doctor',
    description: 'Retorna los bloques horarios del doctor, opcionalmente filtrados por centro médico.',
  })
  @Get(':doctorId/schedules')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.VIEW}`)
  getSchedules(
    @Param('doctorId') doctorId: string,
    @Query('medicalCenterId') medicalCenterId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.scheduleService.getSchedulesByDoctor(
      doctorId,
      medicalCenterId,
      includeInactive === 'true',
    );
  }

  @ApiOperation({
    summary: 'Actualizar un bloque horario',
    description: 'Modifica un bloque horario específico.',
  })
  @Patch('schedules/:blockId')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.UPDATE}`)
  updateScheduleBlock(
    @Param('blockId') blockId: string,
    @Body() dto: UpdateDoctorScheduleBlockDto,
  ) {
    return this.scheduleService.updateBlock(blockId, dto);
  }

  @ApiOperation({
    summary: 'Eliminar un bloque horario',
    description: 'Elimina lógicamente un bloque horario.',
  })
  @Delete('schedules/:blockId')
  @Permission(`${ModuleItemsMenu.DoctorsModule}.${PermissionActionsMenu.DELETE}`)
  removeScheduleBlock(@Param('blockId') blockId: string) {
    return this.scheduleService.removeBlock(blockId);
  }
}
