import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateAvailabilityDto } from '../dto/create-availability.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';
import { AvailabilityService } from '../services/availability.service';

@ApiTags('Availability')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * @summary Crear una nueva disponibilidad.
   * @description Registra un bloque de disponibilidad opcionalmente con descripción y estatus.
   */
  @ApiOperation({
    summary: 'Crear disponibilidad',
    description: 'Registra un nuevo bloque de disponibilidad en el calendario.',
  })
  @Post()
  create(@Body() dto: CreateAvailabilityDto) {
    return this.availabilityService.create(dto);
  }

  /**
   * @summary Listar disponibilidades.
   * @description Retorna todas las disponibilidades registradas sin filtros.
   */
  @ApiOperation({
    summary: 'Listar disponibilidades',
    description: 'Obtiene el listado completo de disponibilidades.',
  })
  @Get()
  findAll() {
    return this.availabilityService.findAll();
  }

  /**
   * @summary Obtener disponibilidad por ID.
   * @description Busca una disponibilidad específica usando su identificador numérico.
   */
  @ApiOperation({
    summary: 'Obtener disponibilidad',
    description: 'Recupera una disponibilidad existente por su ID.',
  })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.availabilityService.findOne(+id);
  }

  /**
   * @summary Actualizar disponibilidad.
   * @description Modifica campos opcionales (descripción, estatus) de una disponibilidad existente.
   */
  @ApiOperation({
    summary: 'Actualizar disponibilidad',
    description: 'Permite cambiar descripción y/o estatus de una disponibilidad.',
  })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.availabilityService.update(+id, dto);
  }

  /**
   * @summary Eliminar disponibilidad.
   * @description Realiza borrado (lógico o físico según implementación del servicio) de una disponibilidad.
   */
  @ApiOperation({
    summary: 'Eliminar disponibilidad',
    description: 'Elimina una disponibilidad por su ID.',
  })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.availabilityService.remove(+id);
  }
}