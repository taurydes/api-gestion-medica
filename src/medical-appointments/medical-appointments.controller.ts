import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { UpdateMedicalAppointmentDto } from './dto/update-medical-appointment.dto';
import { QueryMedicalAppointmentDto } from './dto/query-medical-appointment.dto';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Medical Appointments')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('medical-appointments')
export class MedicalAppointmentsController {
  constructor(
    private readonly appointmentsService: MedicalAppointmentsService,
  ) {}

  // ─── Static routes FIRST (before /:id) ─────────────────────────────────────

  @ApiOperation({
    summary: 'Verificar disponibilidad del médico',
    description:
      'Retorna los bloques horarios ocupados de un médico para una fecha determinada.',
  })
  @ApiQuery({ name: 'doctorId', type: Number, required: true })
  @ApiQuery({
    name: 'date',
    type: String,
    required: true,
    example: '2026-03-15',
  })
  @ApiQuery({ name: 'medicalCenterId', type: String, required: false })
  @Get('availability')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  checkAvailability(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
    @Query('medicalCenterId') medicalCenterId?: string,
  ) {
    return this.appointmentsService.checkAvailability(doctorId, date, medicalCenterId);
  }

  @ApiOperation({
    summary: 'Obtener días disponibles de un médico',
    description:
      'Retorna los días en un rango de fechas donde el doctor tiene horario y cupos disponibles.',
  })
  @ApiQuery({ name: 'doctorId', type: String, required: true })
  @ApiQuery({ name: 'medicalCenterId', type: String, required: true })
  @ApiQuery({ name: 'startDate', type: String, required: true, example: '2026-03-01' })
  @ApiQuery({ name: 'endDate', type: String, required: true, example: '2026-03-31' })
  @Get('available-dates')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  getAvailableDates(
    @Query('doctorId') doctorId: string,
    @Query('medicalCenterId') medicalCenterId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.appointmentsService.getAvailableDates(doctorId, medicalCenterId, startDate, endDate);
  }

  @ApiOperation({
    summary: 'Historial de citas de un paciente',
    description:
      'Retorna todas las citas de un paciente con historial médico, recetas y detalles.',
  })
  @Get('patient/:patientId/history')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  getPatientHistory(
    @Param('patientId') patientId: string,
    @Query() query: QueryMedicalAppointmentDto,
    @Req() req: any,
  ) {
    return this.appointmentsService.getPatientHistory(patientId, query, req.user);
  }

  @ApiOperation({
    summary: 'Agenda de citas de un médico',
    description:
      'Retorna las citas programadas de un médico, con soporte para filtros de fecha y estado.',
  })
  @Get('doctor/:doctorId/schedule')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  getDoctorSchedule(
    @Param('doctorId') doctorId: string,
    @Query() query: QueryMedicalAppointmentDto,
    @Req() req: any,
  ) {
    return this.appointmentsService.getDoctorSchedule(doctorId, query, req.user);
  }

  // ─── Standard CRUD ──────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Crear cita médica',
    description:
      'Registra una nueva cita médica. Si se provee documentNumber, busca o crea al paciente automáticamente.',
  })
  @Post()
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.CREATE}`,
  )
  create(@Body() dto: CreateMedicalAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @ApiOperation({
    summary: 'Listar citas médicas',
    description:
      'Retorna las citas con paginación y filtros (paciente, médico, estado, fecha, etc.).',
  })
  @Get()
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  findAll(@Query() query: QueryMedicalAppointmentDto, @Req() req: any) {
    return this.appointmentsService.findAll(query, req.user);
  }

  @ApiOperation({
    summary: 'Obtener cita por ID',
    description:
      'Devuelve el detalle completo de una cita: paciente, médico, historial, recetas.',
  })
  @Get(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.appointmentsService.findOne(id, req.user);
  }

  @ApiOperation({
    summary: 'Actualizar cita médica',
    description:
      'Modifica datos de una cita (no permite cambios en citas completadas o canceladas).',
  })
  @Patch(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  update(@Param('id') id: string, @Body() dto: UpdateMedicalAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Cancelar cita médica',
    description:
      'Cambia el estado de la cita a "cancelled" con una razón requerida.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        cancellationReason: {
          type: 'string',
          example: 'El paciente no pudo asistir.',
        },
      },
      required: ['cancellationReason'],
    },
  })
  @Patch(':id/cancel')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  cancel(
    @Param('id') id: string,
    @Body('cancellationReason') cancellationReason: string,
  ) {
    return this.appointmentsService.cancel(id, cancellationReason);
  }

  @ApiOperation({
    summary: 'Completar cita médica',
    description:
      'Marca la cita como "completed". Requisito previo para crear historial médico.',
  })
  @Patch(':id/complete')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  complete(@Param('id') id: string) {
    return this.appointmentsService.complete(id);
  }

  @ApiOperation({
    summary: 'Finalizar consulta médica completa',
    description:
      'Registra el historial médico, recetas y marca la cita como completada en un solo paso.',
  })
  @Patch(':id/finish-consultation')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  finishConsultation(
    @Param('id') id: string,
    @Body() dto: CompleteConsultationDto,
    @GetUser('id') userId: string,
  ) {
    return this.appointmentsService.finishConsultation(id, dto, userId);
  }

  @ApiOperation({
    summary: 'Eliminar cita médica',
    description: 'Eliminación lógica (soft delete) de una cita por ID.',
  })
  @Delete(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.DELETE}`,
  )
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}
