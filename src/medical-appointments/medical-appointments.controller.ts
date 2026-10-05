import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MedicalAppointmentsService } from './medical-appointments.service';
import { CreateMedicalAppointmentDto } from './dto/create-medical-appointment.dto';
import { UpdateMedicalAppointmentDto } from './dto/update-medical-appointment.dto';
import { QueryMedicalAppointmentDto } from './dto/query-medical-appointment.dto';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';
import { CancelMedicalAppointmentDto } from './dto/cancel-medical-appointment.dto';
import { AvailabilityQueryDto, AvailableDatesQueryDto } from './dto/availability-query.dto';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

import { ParseUuid } from 'src/common/pipes/parse-uuid.pipe';
import { SendEmailDto } from 'src/email/dto/send-email.dto';
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
  @Get('availability')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  checkAvailability(@Query() query: AvailabilityQueryDto) {
    return this.appointmentsService.checkAvailability(query.doctorId, query.date, query.medicalCenterId);
  }

  @ApiOperation({
    summary: 'Obtener días disponibles de un médico',
    description:
      'Retorna los días en un rango de fechas donde el doctor tiene horario y cupos disponibles.',
  })
  @Get('available-dates')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  getAvailableDates(@Query() query: AvailableDatesQueryDto) {
    const { doctorId, medicalCenterId, startDate, endDate } = query;
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
    @Param('patientId', ParseUuid) patientId: string,
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
    @Param('doctorId', ParseUuid) doctorId: string,
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
  create(@Body() dto: CreateMedicalAppointmentDto, @GetUser('id') userId: string) {
    return this.appointmentsService.create(dto, userId);
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
  findOne(@Param('id', ParseUuid) id: string, @Req() req: any) {
    return this.appointmentsService.findOne(id, req.user);
  }

  @ApiOperation({
    summary: 'Actualizar cita médica',
    description:
      'Modifica datos de una cita (no permite cambios en citas completadas o canceladas). No acepta status: use /confirm, /start-consultation, /cancel o /finish-consultation.',
  })
  @Patch(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  update(
    @Param('id', ParseUuid) id: string,
    @Body() dto: UpdateMedicalAppointmentDto,
    @GetUser('id') userId: string,
  ) {
    return this.appointmentsService.update(id, dto, userId);
  }

  @ApiOperation({
    summary: 'Cancelar cita médica',
    description:
      'Cambia el estado de la cita a "cancelled" con una razón requerida.',
  })
  @Patch(':id/cancel')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  cancel(
    @Param('id', ParseUuid) id: string,
    @Body() dto: CancelMedicalAppointmentDto,
    @GetUser('id') userId: string,
  ) {
    return this.appointmentsService.cancel(id, dto.cancellationReason, userId);
  }

  @ApiOperation({
    summary: 'Confirmar llegada del paciente',
    description: 'Pasa la cita de "pending" a "confirmed".',
  })
  @Patch(':id/confirm')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  confirm(@Param('id', ParseUuid) id: string, @GetUser('id') userId: string) {
    return this.appointmentsService.confirm(id, userId);
  }

  @ApiOperation({
    summary: 'Iniciar consulta',
    description: 'Pasa la cita de "confirmed" a "in_consultation".',
  })
  @Patch(':id/start-consultation')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.UPDATE}`,
  )
  startConsultation(
    @Param('id', ParseUuid) id: string,
    @GetUser('id') userId: string,
  ) {
    return this.appointmentsService.startConsultation(id, userId);
  }

  @ApiOperation({
    summary: 'Finalizar consulta médica completa',
    description:
      'Registra el historial médico, recetas y marca la cita como completada en un solo paso.',
  })
  @Patch(':id/finish-consultation')
  // Closing writes the clinical record, so it needs medical-history.crear (MJ-50).
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.CREATE}`)
  finishConsultation(
    @Param('id', ParseUuid) id: string,
    @Body() dto: CompleteConsultationDto,
    @GetUser('id') userId: string,
  ) {
    return this.appointmentsService.finishConsultation(id, dto, userId);
  }

  @ApiOperation({
    summary: 'Enviar por correo el resumen de una cita completada',
    description:
      'Encola el resumen (fecha, médico, motivo, diagnóstico, observaciones, exámenes) con la receta en PDF si la hay. 202 { jobId }; estado en GET /documents/jobs/:jobId.',
  })
  @Post(':id/email-summary')
  @HttpCode(HttpStatus.ACCEPTED)
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.VIEW}`,
  )
  emailSummary(
    @Param('id', ParseUuid) id: string,
    @Body() dto: SendEmailDto,
    @GetUser('id') userId: string,
  ) {
    return this.appointmentsService.emailSummary(id, dto.to, userId);
  }

  @ApiOperation({
    summary: 'Eliminar cita médica',
    description: 'Eliminación lógica (soft delete) de una cita por ID.',
  })
  @Delete(':id')
  @Permission(
    `${ModuleItemsMenu.MedicalAppointmentsModule}.${PermissionActionsMenu.DELETE}`,
  )
  remove(@Param('id', ParseUuid) id: string, @GetUser('id') userId: string) {
    return this.appointmentsService.remove(id, userId);
  }
}
