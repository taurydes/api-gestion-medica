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
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { MedicationService } from '../services/medication.service';
import { CreateMedicationDto } from '../dto/medication/create-medication.dto';
import { UpdateMedicationDto } from '../dto/medication/update-medication.dto';
import { MedicationQueryDto } from '../dto/medication/medication-query.dto';

@ApiTags('Medications')
@ApiBearerAuth()
@Throttle({ long: {} })
@Controller('medications')
export class MedicationController {
  constructor(private readonly medicationService: MedicationService) {}

  @ApiOperation({ summary: 'Crear medicamento' })
  @Post()
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createDto: CreateMedicationDto) {
    return this.medicationService.create(createDto);
  }

  @ApiOperation({ summary: 'Listar medicamentos' })
  @Get()
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: MedicationQueryDto) {
    return this.medicationService.findAll(query);
  }

  @ApiOperation({ summary: 'Obtener medicamento por ID' })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.medicationService.findOne(+id);
  }

  @ApiOperation({ summary: 'Actualizar medicamento' })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updateDto: UpdateMedicationDto) {
    return this.medicationService.update(+id, updateDto);
  }

  @ApiOperation({ summary: 'Eliminar medicamento' })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.medicationService.remove(+id);
  }
}
