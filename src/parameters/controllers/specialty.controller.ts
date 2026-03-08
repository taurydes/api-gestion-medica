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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SpecialtyService } from '../services/specialty.service';
import { CreateSpecialtyDto } from '../dto/specialty/create-specialty.dto';
import { UpdateSpecialtyDto } from '../dto/specialty/update-specialty.dto';
import { SpecialtyQueryDto } from '../dto/specialty/specialty-query.dto';

/**
 * Controlador para gestionar las especialidades médicas
 * Endpoints CRUD con documentación Swagger
 */
@ApiTags('Parámetros - Especialidades Médicas')
@Controller('specialties')
export class SpecialtyController {
  constructor(private readonly specialtyService: SpecialtyService) {}

  /**
   * Crear una nueva especialidad médica
   */
  @Post()
  @ApiOperation({ summary: 'Crear una nueva especialidad médica' })
  @ApiResponse({ status: 201, description: 'Especialidad creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o duplicados' })
  create(@Body() createSpecialtyDto: CreateSpecialtyDto) {
    return this.specialtyService.create(createSpecialtyDto);
  }

  /**
   * Listar especialidades con filtros y paginación
   */
  @Get()
  @ApiOperation({ summary: 'Listar especialidades médicas con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista de especialidades' })
  findAll(@Query() query: SpecialtyQueryDto) {
    return this.specialtyService.findAll(query);
  }

  /**
   * Obtener una especialidad por ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una especialidad por ID' })
  @ApiResponse({ status: 200, description: 'Especialidad encontrada' })
  @ApiResponse({ status: 404, description: 'Especialidad no encontrada' })
  findOne(@Param('id') id: string) {
    return this.specialtyService.findOne(id);
  }

  /**
   * Actualizar una especialidad existente
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una especialidad existente' })
  @ApiResponse({ status: 200, description: 'Especialidad actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Especialidad no encontrada' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o duplicados' })
  update(
    @Param('id') id: string,
    @Body() updateSpecialtyDto: UpdateSpecialtyDto,
  ) {
    return this.specialtyService.update(id, updateSpecialtyDto);
  }

  /**
   * Eliminar una especialidad (soft delete)
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una especialidad (soft delete)' })
  @ApiResponse({ status: 200, description: 'Especialidad eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Especialidad no encontrada' })
  remove(@Param('id') id: string) {
    return this.specialtyService.remove(id);
  }
}
