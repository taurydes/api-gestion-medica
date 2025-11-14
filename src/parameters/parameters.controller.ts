import { Controller, Get, Param } from '@nestjs/common';
import { ParametersService } from './parameters.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Parameters')
@Controller('parameters')
@ApiBearerAuth()
@Throttle({ short: {} })
export class ParametersController {
  constructor(private readonly parametersService: ParametersService) {}

  /**
   * @summary Listar todos los kioskos.
   * @description Retorna el listado completo de kioskos registrados en el sistema.
   */
  @Get()
  @ApiOperation({
    summary: 'List all kiosks',
    description: 'Returns a list of all kiosks in the system.',
  })
  async list() {
    return this.parametersService.listKiosko();
  }

  /**
   * @summary Obtener kiosko por ID.
   * @description Busca y retorna el detalle de un kiosko específico según su identificador.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a kiosk by ID',
    description: 'Returns the kiosk details for the given ID.',
  })
  async findOne(@Param('id') id: number) {
    return this.parametersService.findKiosko(id);
  }
}