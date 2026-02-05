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
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { PatientService } from './patient.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { GetUser } from 'src/auth/decorators/get-user.decorator';

/**
 * Controlador para gestionar los pacientes del sistema
 * Endpoints CRUD completo con documentación Swagger
 */
@ApiTags('Pacientes')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  /**
   * Crear un nuevo paciente
   */
  @ApiOperation({
    summary: 'Crear paciente',
    description: 'Crea un nuevo paciente en el sistema. Si el documento ya existe como persona común, se asocia automáticamente.',
  })
  @ApiResponse({ status: 201, description: 'Paciente creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o paciente ya registrado' })
  @Post()
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.CREATE}`)
  create(
    @Body() createPatientDto: CreatePatientDto,
    @GetUser('id') userId: number,
  ) {
    return this.patientService.create(createPatientDto, userId);
  }

  /**
   * Listar pacientes con filtros y paginación
   */
  @ApiOperation({
    summary: 'Listar pacientes',
    description: 'Obtiene una lista paginada de pacientes con filtros opcionales.',
  })
  @ApiResponse({ status: 200, description: 'Lista de pacientes' })
  @Get()  
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: PatientQueryDto) {
    return this.patientService.findAll(query);
  }

  /**
   * Obtener un paciente por ID
   */
  @ApiOperation({
    summary: 'Obtener paciente por ID',
    description: 'Obtiene un paciente específico por su ID.',
  })
  @ApiResponse({ status: 200, description: 'Paciente encontrado' })
  @ApiResponse({ status: 404, description: 'Paciente no encontrado' })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientService.findOne(id);
  }

  /**
   * Buscar paciente por número de documento
   */
  @ApiOperation({
    summary: 'Buscar paciente por documento',
    description: 'Busca un paciente por su número de documento de identidad.',
  })
  @ApiResponse({ status: 200, description: 'Paciente encontrado' })
  @ApiResponse({ status: 404, description: 'Paciente no encontrado' })
  @Get('document/:documentNumber')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findByDocument(
    @Param('documentNumber') documentNumber: string,
    @Query('letter') letter?: string,
  ) {
    return this.patientService.findByDocumentNumber(documentNumber, letter);
  }

  /**
   * Actualizar un paciente existente
   */
  @ApiOperation({
    summary: 'Actualizar paciente',
    description: 'Actualiza la información de un paciente existente.',
  })
  @ApiResponse({ status: 200, description: 'Paciente actualizado exitosamente' })
  @ApiResponse({ status: 404, description: 'Paciente no encontrado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.UPDATE}`)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePatientDto: UpdatePatientDto,
    @GetUser('id') userId: number,
  ) {
    return this.patientService.update(id, updatePatientDto, userId);
  }

  /**
   * Eliminar un paciente (soft delete)
   */
  @ApiOperation({
    summary: 'Eliminar paciente',
    description: 'Elimina un paciente del sistema (soft delete).',
  })
  @ApiResponse({ status: 200, description: 'Paciente eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Paciente no encontrado' })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientService.remove(id);
  }
}
