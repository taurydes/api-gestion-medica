import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientService } from './patient.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Patients')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @ApiOperation({
    summary: 'Crear paciente',
    description: 'Crea un nuevo paciente en el sistema.',
  })
  @Post()
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createPatientDto: CreatePatientDto) {
    return this.patientService.create(createPatientDto);
  }

  @ApiOperation({
    summary: 'Listar pacientes',
    description: 'Obtiene una lista de todos los pacientes registrados.',
  })
  @Get()  
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findAll() {
    return this.patientService.findAll();
  }

  @ApiOperation({
    summary: 'Obtener paciente por ID',
    description: 'Obtiene un paciente específico por su ID.',
  })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.patientService.findOne(+id);
  }

  @ApiOperation({
    summary: 'Actualizar paciente',
    description: 'Actualiza la información de un paciente existente.',
  })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updatePatientDto: UpdatePatientDto) {
    return this.patientService.update(+id, updatePatientDto);
  }

  @ApiOperation({
    summary: 'Eliminar paciente',
    description: 'Elimina un paciente del sistema (soft delete).',
  })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.patientService.remove(+id);
  }
}
