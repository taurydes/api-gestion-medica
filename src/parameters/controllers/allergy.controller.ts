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
import { AllergyService } from '../services/allergy.service';
import { CreateAllergyDto } from '../dto/allergy/create-allergy.dto';
import { UpdateAllergyDto } from '../dto/allergy/update-allergy.dto';
import { AllergyQueryDto } from '../dto/allergy/allergy-query.dto';

@ApiTags('Allergies')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('allergies')
export class AllergyController {
  constructor(private readonly allergyService: AllergyService) {}

  @ApiOperation({ summary: 'Crear alergia' })
  @Post()
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.CREATE}`)
  create(@Body() createAllergyDto: CreateAllergyDto) {
    return this.allergyService.create(createAllergyDto);
  }

  @ApiOperation({ summary: 'Listar alergias' })
  @Get()
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: AllergyQueryDto) {
    return this.allergyService.findAll(query);
  }

  @ApiOperation({ summary: 'Obtener alergia por ID' })
  @Get(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string) {
    return this.allergyService.findOne(+id);
  }

  @ApiOperation({ summary: 'Actualizar alergia' })
  @Patch(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.UPDATE}`)
  update(@Param('id') id: string, @Body() updateAllergyDto: UpdateAllergyDto) {
    return this.allergyService.update(+id, updateAllergyDto);
  }

  @ApiOperation({ summary: 'Eliminar alergia' })
  @Delete(':id')
  @Permission(`${ModuleItemsMenu.ParametersModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.allergyService.remove(+id);
  }
}
