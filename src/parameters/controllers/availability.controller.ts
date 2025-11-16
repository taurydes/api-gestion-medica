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

import { AvailabilityService } from '../services/availability.service';
import { CreateAvailabilityDto } from '../dto/create/create-availability.dto';
import { UpdateAvailabilityDto } from '../dto/update/update-availability.dto';
import { AvailabilityPaginationDto } from '../dto/query/availability-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { PermissionActionsMenu } from 'src/permission/permission.const';

@ApiTags('Availability')
@ApiBearerAuth()
@Throttle({ short: {} })
@Public()
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * @summary Crear una nueva disponibilidad.
   */
  @ApiOperation({ summary: 'Crear disponibilidad' })
  @Permission(`availability.${PermissionActionsMenu.CREATE}`)
  @Post()
  create(@Body() dto: CreateAvailabilityDto) {
    return this.availabilityService.create(dto);
  }

  /**
   * @summary Listar disponibilidades con filtros y paginación.
   */
  @ApiOperation({ summary: 'Listar disponibilidades (paginado)' })
  @Get()
  findAll(@Query() query: AvailabilityPaginationDto) {
    return this.availabilityService.findAll(query);
  }

  /**
   * @summary Obtener disponibilidad por ID.
   */
  @ApiOperation({ summary: 'Obtener disponibilidad por ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.availabilityService.findOne(+id);
  }

  /**
   * @summary Actualizar disponibilidad.
   */
  @ApiOperation({ summary: 'Actualizar disponibilidad' })
  @Permission(`availability.${PermissionActionsMenu.UPDATE}`)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAvailabilityDto) {
    return this.availabilityService.update(+id, dto);
  }

  /**
   * @summary Eliminar disponibilidad.
   */
  @ApiOperation({ summary: 'Eliminar disponibilidad' })
  @Permission(`availability.${PermissionActionsMenu.DELETE}`)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.availabilityService.remove(+id);
  }
}
