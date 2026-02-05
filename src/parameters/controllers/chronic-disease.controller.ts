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
import { ChronicDiseaseService } from '../services/chronic-disease.service';
import { CreateChronicDiseaseDto } from '../dto/chronic-disease/create-chronic-disease.dto';
import { UpdateChronicDiseaseDto } from '../dto/chronic-disease/update-chronic-disease.dto';
import { ChronicDiseaseQueryDto } from '../dto/chronic-disease/chronic-disease-query.dto';

@ApiTags('Chronic Diseases')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('chronic-diseases')
export class ChronicDiseaseController {
  constructor(private readonly chronicDiseaseService: ChronicDiseaseService) {}

  @ApiOperation({ summary: 'Crear enfermedad crónica' })
  @Post()
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createDto: CreateChronicDiseaseDto) {
    return this.chronicDiseaseService.create(createDto);
  }

  @ApiOperation({ summary: 'Listar enfermedades crónicas' })
  @Get()
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: ChronicDiseaseQueryDto) {
    return this.chronicDiseaseService.findAll(query);
  }

  @ApiOperation({ summary: 'Obtener enfermedad crónica por ID' })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.chronicDiseaseService.findOne(+id);
  }

  @ApiOperation({ summary: 'Actualizar enfermedad crónica' })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updateDto: UpdateChronicDiseaseDto) {
    return this.chronicDiseaseService.update(+id, updateDto);
  }

  @ApiOperation({ summary: 'Eliminar enfermedad crónica' })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.chronicDiseaseService.remove(+id);
  }
}
