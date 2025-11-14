import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from 'src/auth/interfaces/User';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateAdvertisingPlanDto } from './dto/create-advertising-plan.dto';
import { UpdateAdvertisingPlanDto } from './dto/update-advertising-plan.dto';
import { PlanService } from './plan.service';

@ApiTags('Plans')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  /**
   * @summary Crear un nuevo plan de publicidad.
   * @description Registra un plan con código, nombre, duración, precio y otros campos opcionales.
   */
  @ApiOperation({
    summary: 'Crear plan de publicidad',
    description:
      'Crea un nuevo plan de publicidad con sus propiedades básicas (code, name, duration, price).',
  })
  @Post()
  async create(
    @Body() dto: CreateAdvertisingPlanDto,
    @GetUser() currentUser: AuthUser,
  ) {
    return this.planService.create(dto, currentUser);
  }

  /**
   * @summary Listar todos los planes.
   * @description Devuelve el listado completo de planes de publicidad registrados.
   */
  @ApiOperation({
    summary: 'Listar planes',
    description: 'Obtiene todos los planes de publicidad disponibles.',
  })
  @Get()
  async findAll() {
    return this.planService.findAll();
  }

  /**
   * @summary Obtener plan por ID.
   * @description Retorna el detalle de un plan de publicidad específico.
   */
  @ApiOperation({
    summary: 'Obtener plan',
    description: 'Recupera un plan de publicidad usando su ID numérico.',
  })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.planService.findOne(+id);
  }

  /**
   * @summary Actualizar plan.
   * @description Modifica propiedades del plan (nombre, duración, precio, etc.).
   */
  @ApiOperation({
    summary: 'Actualizar plan',
    description: 'Actualiza campos del plan de publicidad indicado por ID.',
  })
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdvertisingPlanDto,
  ) {
    return this.planService.update(+id, dto);
  }

  /**
   * @summary Eliminar plan.
   * @description Elimina (lógica o físicamente según implementación) un plan existente.
   */
  @ApiOperation({
    summary: 'Eliminar plan',
    description: 'Elimina un plan de publicidad por su ID.',
  })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.planService.remove(+id);
  }
}