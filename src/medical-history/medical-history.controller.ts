import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MedicalHistoryService } from './medical-history.service';
import { CreateMedicalHistoryDto } from './dto/create-medical-history.dto';
import { UpdateMedicalHistoryDto } from './dto/update-medical-history.dto';
import { CreateMedicalReviewDto } from './dto/create-medical-review.dto';
import { MedicalHistoryQueryDto } from './dto/medical-history-query.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { PermissionActionsMenu } from 'src/permission/permission.const';

/**
 * Controlador para gestionar el historial médico de los pacientes
 * Endpoints CRUD completo más funcionalidad de reseñas/diagnósticos
 */
@ApiTags('Historial Médico')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('medical-history')
export class MedicalHistoryController {
  constructor(private readonly medicalHistoryService: MedicalHistoryService) {}

  /**
   * Crear un nuevo registro de historial médico (iniciar consulta)
   */
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo registro de historial médico (iniciar consulta)' })
  @ApiResponse({ status: 201, description: 'Historial médico creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o entidades no encontradas' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.CREATE}`)
  create(
    @Body() createDto: CreateMedicalHistoryDto,
    @GetUser('id') userId: number,
  ) {
    return this.medicalHistoryService.create(createDto, userId);
  }

  /**
   * Listar historiales médicos con filtros y paginación
   */
  @Get()
  @ApiOperation({ summary: 'Listar historiales médicos con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista de historiales médicos' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: MedicalHistoryQueryDto) {
    return this.medicalHistoryService.findAll(query);
  }

  /**
   * Obtener un historial médico por ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un historial médico por ID' })
  @ApiResponse({ status: 200, description: 'Historial médico encontrado' })
  @ApiResponse({ status: 404, description: 'Historial médico no encontrado' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.medicalHistoryService.findOne(id);
  }

  /**
   * Obtener todo el historial médico de un paciente
   */
  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Obtener todo el historial médico de un paciente' })
  @ApiResponse({ status: 200, description: 'Lista de historiales del paciente' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.VIEW}`)
  findByPatient(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.medicalHistoryService.findByPatient(patientId);
  }

  /**
   * Actualizar un historial médico existente
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un historial médico existente' })
  @ApiResponse({ status: 200, description: 'Historial médico actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Historial médico no encontrado' })
  @ApiResponse({ status: 400, description: 'No se puede actualizar consulta completada/cancelada' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.UPDATE}`)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateMedicalHistoryDto,
    @GetUser('id') userId: number,
  ) {
    return this.medicalHistoryService.update(id, updateDto, userId);
  }

  /**
   * Agregar diagnóstico/reseña médica a una consulta (finalizar consulta)
   */
  @Post('review')
  @ApiOperation({ summary: 'Agregar diagnóstico/reseña médica (finalizar consulta)' })
  @ApiResponse({ status: 200, description: 'Diagnóstico agregado exitosamente' })
  @ApiResponse({ status: 404, description: 'Historial médico no encontrado' })
  @ApiResponse({ status: 400, description: 'La consulta ya fue completada o cancelada' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.UPDATE}`)
  createMedicalReview(
    @Body() reviewDto: CreateMedicalReviewDto,
    @GetUser('id') userId: number,
  ) {
    return this.medicalHistoryService.createMedicalReview(reviewDto, userId);
  }

  /**
   * Cancelar una consulta médica
   */
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una consulta médica' })
  @ApiResponse({ status: 200, description: 'Consulta cancelada exitosamente' })
  @ApiResponse({ status: 404, description: 'Historial médico no encontrado' })
  @ApiResponse({ status: 400, description: 'No se puede cancelar consulta completada' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.UPDATE}`)
  cancelConsultation(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ) {
    return this.medicalHistoryService.cancelConsultation(id, userId);
  }

  /**
   * Eliminar un historial médico (soft delete)
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un historial médico (soft delete)' })
  @ApiResponse({ status: 200, description: 'Historial médico eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Historial médico no encontrado' })
  @Permission(`${ModuleItemsMenu.MedicalHistoryModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.medicalHistoryService.remove(id);
  }
}
