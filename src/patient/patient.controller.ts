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
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientQueryDto } from './dto/patient-query.dto';
import { PatientService } from './patient.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
    description:
      'Crea un nuevo paciente en el sistema. Si el documento ya existe como persona común, se asocia automáticamente.',
  })
  @ApiResponse({ status: 201, description: 'Paciente creado exitosamente' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o paciente ya registrado',
  })
  @Post()
  @Permission(
    `${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.CREATE}`,
  )
  async create(
    @Body() createPatientDto: CreatePatientDto,
    @GetUser('id') userId: string,
  ) {
    return await this.patientService.create(createPatientDto, userId);
  }

  /**
   * Listar pacientes con filtros y paginación
   */
  @ApiOperation({
    summary: 'Listar pacientes',
    description:
      'Obtiene una lista paginada de pacientes con filtros opcionales.',
  })
  @ApiResponse({ status: 200, description: 'Lista de pacientes' })
  @Get()
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  async findAll(@Query() query: PatientQueryDto) {
    return await this.patientService.findAll(query);
  }

  /**
   * Buscar paciente por número de documento y letra
   */
  @ApiOperation({ summary: 'Buscar paciente por documento y letra' })
  @Get('by-document')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  async findByDocument(
    @Query('documentNumber') documentNumber: string,
    @Query('letter') letter: string,
  ) {
    return await this.patientService.findByDocumentNumber(
      documentNumber,
      letter,
    );
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
  async findOne(@Param('id') id: string) {
    return await this.patientService.findOne(id);
  }

  /**
   * Actualizar un paciente existente
   */
  @ApiOperation({
    summary: 'Actualizar paciente',
    description: 'Actualiza la información de un paciente existente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paciente actualizado exitosamente',
  })
  @ApiResponse({ status: 404, description: 'Paciente no encontrado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @Patch(':id')
  @Permission(
    `${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.UPDATE}`,
  )
  async update(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @GetUser('id') userId: string,
  ) {
    return await this.patientService.update(id, updatePatientDto, userId);
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
  @Permission(
    `${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.DELETE}`,
  )
  async remove(@Param('id') id: string) {
    return await this.patientService.remove(id);
  }
}
