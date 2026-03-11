import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RecipeService } from './recipe.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { RecipeQueryDto } from './dto/recipe-query.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Throttle } from '@nestjs/throttler';
import { Permission } from 'src/auth/decorators/permission.decorator';
import { ModuleItemsMenu } from 'src/menu/menu.const';
import { PermissionActionsMenu } from 'src/permission/permission.const';

/**
 * Controlador para gestionar las recetas médicas
 * Endpoints CRUD completo con funcionalidad de dispensación y cancelación
 */
@ApiTags('Recetas Médicas')
@ApiBearerAuth()
@Throttle({ short: {} })
@Controller('recipes')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  /**
   * Crear una nueva receta médica
   */
  @Post()
  @ApiOperation({ summary: 'Crear una nueva receta médica' })
  @ApiResponse({ status: 201, description: 'Receta creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos o entidades no encontradas' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.VIEW}`)
  create(
    @Body() createDto: CreateRecipeDto,
    @GetUser('id') userId: string,
  ) {
    return this.recipeService.create(createDto, userId);
  }

  /**
   * Listar recetas con filtros y paginación
   */
  @Get()
  @ApiOperation({ summary: 'Listar recetas médicas con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista de recetas médicas' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.VIEW}`)
  findAll(@Query() query: RecipeQueryDto, @Req() req: any) {
    return this.recipeService.findAll(query, req.user);
  }

  /**
   * Obtener una receta por ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una receta médica por ID' })
  @ApiResponse({ status: 200, description: 'Receta encontrada' })
  @ApiResponse({ status: 404, description: 'Receta no encontrada' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.VIEW}`)
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.recipeService.findOne(id, req.user);
  }

  /**
   * Obtener todas las recetas de un paciente
   */
  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Obtener todas las recetas de un paciente' })
  @ApiResponse({ status: 200, description: 'Lista de recetas del paciente' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.VIEW}`)
  findByPatient(@Param('patientId') patientId: string, @Req() req: any) {
    return this.recipeService.findByPatient(patientId, req.user);
  }

  /**
   * Obtener recetas asociadas a un historial médico
   */
  @Get('medical-history/:medicalHistoryId')
  @ApiOperation({ summary: 'Obtener recetas de un historial médico específico' })
  @ApiResponse({ status: 200, description: 'Lista de recetas del historial' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.VIEW}`)
  findByMedicalHistory(
    @Param('medicalHistoryId') medicalHistoryId: string,
  ) {
    return this.recipeService.findByMedicalHistory(medicalHistoryId);
  }

  /**
   * Actualizar una receta existente
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una receta médica existente' })
  @ApiResponse({ status: 200, description: 'Receta actualizada exitosamente' })
  @ApiResponse({ status: 404, description: 'Receta no encontrada' })
  @ApiResponse({ status: 400, description: 'No se puede actualizar receta dispensada/cancelada' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.UPDATE}`)
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateRecipeDto,
    @GetUser('id') userId: string,
  ) {
    return this.recipeService.update(id, updateDto, userId);
  }

  /**
   * Marcar una receta como dispensada
   */
  @Patch(':id/dispense')
  @ApiOperation({ summary: 'Marcar una receta como dispensada' })
  @ApiResponse({ status: 200, description: 'Receta marcada como dispensada' })
  @ApiResponse({ status: 404, description: 'Receta no encontrada' })
  @ApiResponse({ status: 400, description: 'Solo se pueden dispensar recetas activas' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.UPDATE}`)
  markAsDispensed(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.recipeService.markAsDispensed(id, userId);
  }

  /**
   * Cancelar una receta médica
   */
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una receta médica' })
  @ApiResponse({ status: 200, description: 'Receta cancelada exitosamente' })
  @ApiResponse({ status: 404, description: 'Receta no encontrada' })
  @ApiResponse({ status: 400, description: 'No se puede cancelar receta dispensada' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.UPDATE}`)
  cancel(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.recipeService.cancel(id, userId);
  }

  /**
   * Eliminar una receta (soft delete)
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una receta médica (soft delete)' })
  @ApiResponse({ status: 200, description: 'Receta eliminada exitosamente' })
  @ApiResponse({ status: 404, description: 'Receta no encontrada' })
  @Permission(`${ModuleItemsMenu.RecipeModule}.${PermissionActionsMenu.DELETE}`)
  remove(@Param('id') id: string) {
    return this.recipeService.remove(id);
  }
}
