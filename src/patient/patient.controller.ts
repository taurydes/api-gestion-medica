import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';
import { Permission } from 'src/auth/decorators/permission.decorator';

@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createPatientDto: CreatePatientDto) {
    return this.patientService.create(createPatientDto);
  }

  @Get()
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findAll() {
    return this.patientService.findAll();
  }

  @Get(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.patientService.findOne(+id);
  }

  @Patch(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updatePatientDto: UpdatePatientDto) {
    return this.patientService.update(+id, updatePatientDto);
  }

  @Delete(':id')
  @Permission(`${ModuleItemsMenu.PatientModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.patientService.remove(+id);
  }
}
