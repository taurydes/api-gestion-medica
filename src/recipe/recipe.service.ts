import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { RecipeQueryDto } from './dto/recipe-query.dto';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';

/**
 * Servicio para gestionar las recetas médicas
 * Incluye CRUD completo con caché Redis, soft delete y manejo de ítems
 */
@Injectable()
export class RecipeService {
  constructor(
    @InjectRepository(Recipe, DatabaseConnectionName.DB_MAIN)
    private readonly recipeRepository: Repository<Recipe>,

    @InjectRepository(RecipeItem, DatabaseConnectionName.DB_MAIN)
    private readonly recipeItemRepository: Repository<RecipeItem>,

    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepository: Repository<Patient>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepository: Repository<Doctor>,

    @InjectRepository(MedicalHistory, DatabaseConnectionName.DB_MAIN)
    private readonly medicalHistoryRepository: Repository<MedicalHistory>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 🔥 Método para limpiar cache de paginaciones dinámicas
   */
  private async clearQueryCache(): Promise<void> {
    const listKey = 'recipe:query:keys';

    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    for (const key of keys) {
      await this.cacheManager.del(key);
    }

    await this.cacheManager.del(listKey);
  }

  /**
   * Genera un número de receta único
   * Formato: REC-YYYY-XXXXX (ej: REC-2026-00001)
   */
  private async generateRecipeNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REC-${year}-`;

    // Obtener el último número de receta del año actual
    const lastRecipe = await this.recipeRepository
      .createQueryBuilder('recipe')
      .where('recipe.recipeNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('recipe.recipeNumber', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastRecipe) {
      const lastNumber = parseInt(lastRecipe.recipeNumber.split('-')[2], 10);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
  }

  /**
   * Crear una nueva receta médica
   * @param dto - Datos de la receta
   * @param userId - ID del usuario que crea el registro (opcional)
   * @returns Receta creada con sus ítems
   */
  async create(dto: CreateRecipeDto, userId?: string): Promise<Recipe> {
    try {
      // 1️⃣ Verificar que el historial médico exista
      const medicalHistory = await this.medicalHistoryRepository.findOne({
        where: { id: dto.medicalHistoryId },
      });

      if (!medicalHistory) {
        throw new BadRequestException(
          `El historial médico con ID ${dto.medicalHistoryId} no existe o ha sido eliminado.`,
        );
      }

      // 2️⃣ Verificar que el paciente exista
      const patient = await this.patientRepository.findOne({
        where: { id: dto.patientId },
      });

      if (!patient) {
        throw new BadRequestException(
          `El paciente con ID ${dto.patientId} no existe o ha sido eliminado.`,
        );
      }

      // 3️⃣ Verificar que el doctor exista
      const doctor = await this.doctorRepository.findOne({
        where: { id: dto.doctorId },
      });

      if (!doctor) {
        throw new BadRequestException(
          `El doctor con ID ${dto.doctorId} no existe o ha sido eliminado.`,
        );
      }

      // 4️⃣ Generar número de receta único
      const recipeNumber = await this.generateRecipeNumber();

      // 5️⃣ Crear la receta
      const { items, ...recipeData } = dto;

      const newRecipe = this.recipeRepository.create({
        ...recipeData,
        recipeNumber,
        issueDate: new Date(),
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        status: 'active',
        createdBy: userId,
      });

      const savedRecipe = await this.recipeRepository.save(newRecipe);

      // 6️⃣ Crear los ítems de la receta
      const recipeItems = items.map((item, index) =>
        this.recipeItemRepository.create({
          ...item,
          recipeId: savedRecipe.id,
          orderNumber: item.orderNumber ?? index + 1,
        }),
      );

      await this.recipeItemRepository.save(recipeItems);

      // 🧹 Limpiar cache global
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();

      // Retornar con relaciones cargadas
      return this.findOne(savedRecipe.id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Error al crear la receta: ${error.message}`,
      );
    }
  }

  /**
   * Listar recetas médicas con filtros + paginación + cache
   * @param query - Parámetros de búsqueda y paginación
   * @returns Lista paginada de recetas
   */
  async findAll(query: RecipeQueryDto) {
    const {
      page,
      limit,
      order,
      search,
      patientId,
      doctorId,
      medicalHistoryId,
      status,
      isActive,
      startDate,
      endDate,
    } = query;

    // 🔑 Key única para esta consulta
    const cacheKey = `recipe:query:${JSON.stringify(query)}`;
    const listKey = 'recipe:query:keys';

    // 1️⃣ Consultar cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // 2️⃣ Construir QueryBuilder
    const qb = this.recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('recipe.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('recipe.medicalHistory', 'medicalHistory')
      .leftJoinAndSelect('recipe.items', 'items')
      .where('recipe.deletedAt IS NULL');

    // 🔍 Filtros
    if (search) {
      qb.andWhere(
        '(recipe.recipeNumber ILIKE :search OR recipe.diagnosis ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (patientId) {
      qb.andWhere('recipe.patientId = :patientId', { patientId });
    }

    if (doctorId) {
      qb.andWhere('recipe.doctorId = :doctorId', { doctorId });
    }

    if (medicalHistoryId) {
      qb.andWhere('recipe.medicalHistoryId = :medicalHistoryId', { medicalHistoryId });
    }

    if (status) {
      qb.andWhere('recipe.status = :status', { status });
    }

    if (isActive !== undefined) {
      qb.andWhere('recipe.isActive = :isActive', { isActive });
    }

    if (startDate) {
      qb.andWhere('recipe.issueDate >= :startDate', {
        startDate: new Date(startDate),
      });
    }

    if (endDate) {
      qb.andWhere('recipe.issueDate <= :endDate', {
        endDate: new Date(endDate),
      });
    }

    qb.orderBy('recipe.issueDate', order);
    qb.addOrderBy('items.orderNumber', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const result = { data: items, total, page, limit };

    // 3️⃣ Guardar en cache por 5 min
    await this.cacheManager.set(cacheKey, result, 300);

    // 4️⃣ Registrar la key para poder limpiarla después
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];

    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys);
    }

    return result;
  }

  /**
   * Obtener una receta médica por ID con cache
   * @param id - ID de la receta
   * @returns Receta encontrada con todas sus relaciones
   */
  async findOne(id: string): Promise<Recipe> {
    const cacheKey = `recipe:${id}`;

    try {
      // Consultar cache
      const cached = await this.cacheManager.get<Recipe>(cacheKey);
      if (cached) return cached;

      const recipe = await this.recipeRepository.findOne({
        where: { id },
        relations: [
          'patient',
          'patient.commonPerson',
          'doctor',
          'doctor.commonPerson',
          'medicalHistory',
          'items',
          'items.medication',
        ],
        order: {
          items: {
            orderNumber: 'ASC',
          },
        },
      });

      if (!recipe) {
        throw new NotFoundException(
          `Receta con ID ${id} no encontrada.`,
        );
      }

      // Guardar en cache por 10 min
      await this.cacheManager.set(cacheKey, recipe, 600);

      return recipe;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al obtener la receta: ${error.message}`,
      );
    }
  }

  /**
   * Obtener todas las recetas de un paciente
   * @param patientId - ID del paciente
   * @returns Lista de recetas del paciente
   */
  async findByPatient(patientId: string): Promise<Recipe[]> {
    const cacheKey = `recipe:patient:${patientId}`;

    try {
      const cached = await this.cacheManager.get<Recipe[]>(cacheKey);
      if (cached) return cached;

      const recipes = await this.recipeRepository.find({
        where: { patientId },
        relations: [
          'doctor',
          'doctor.commonPerson',
          'medicalHistory',
          'items',
        ],
        order: { issueDate: 'DESC' },
      });

      await this.cacheManager.set(cacheKey, recipes, 300);

      return recipes;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener las recetas del paciente: ${error.message}`,
      );
    }
  }

  /**
   * Obtener recetas asociadas a un historial médico específico
   * @param medicalHistoryId - ID del historial médico
   * @returns Lista de recetas del historial
   */
  async findByMedicalHistory(medicalHistoryId: string): Promise<Recipe[]> {
    const cacheKey = `recipe:medical-history:${medicalHistoryId}`;

    try {
      const cached = await this.cacheManager.get<Recipe[]>(cacheKey);
      if (cached) return cached;

      const recipes = await this.recipeRepository.find({
        where: { medicalHistoryId },
        relations: ['items', 'items.medication'],
        order: { issueDate: 'DESC' },
      });

      await this.cacheManager.set(cacheKey, recipes, 300);

      return recipes;
    } catch (error) {
      throw new NotFoundException(
        `Error al obtener las recetas del historial médico: ${error.message}`,
      );
    }
  }

  /**
   * Actualizar una receta médica existente
   * @param id - ID de la receta
   * @param dto - Datos a actualizar
   * @param userId - ID del usuario que actualiza (opcional)
   * @returns Receta actualizada
   */
  async update(
    id: string,
    dto: UpdateRecipeDto,
    userId?: string,
  ): Promise<Recipe> {
    try {
      const recipe = await this.recipeRepository.findOne({
        where: { id },
        relations: ['items'],
      });

      if (!recipe) {
        throw new NotFoundException(
          `Receta con ID ${id} no encontrada.`,
        );
      }

      // No permitir actualizar recetas dispensadas o canceladas
      if (recipe.status === 'dispensed' || recipe.status === 'cancelled') {
        throw new BadRequestException(
          'No se puede actualizar una receta que ya ha sido dispensada o cancelada.',
        );
      }

      const { items, ...recipeData } = dto;

      // Actualizar datos de la receta
      await this.recipeRepository.update(id, {
        ...recipeData,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        updatedBy: userId,
      });

      // Actualizar ítems si se proporcionan
      if (items && items.length > 0) {
        // Eliminar ítems existentes
        await this.recipeItemRepository.delete({ recipeId: id });

        // Crear nuevos ítems
        const newItems = items.map((item, index) =>
          this.recipeItemRepository.create({
            ...item,
            recipeId: id,
            orderNumber: item.orderNumber ?? index + 1,
          }),
        );

        await this.recipeItemRepository.save(newItems);
      }

      // 🧹 Limpiar caches
      await this.cacheManager.del(`recipe:${id}`);
      await this.cacheManager.del(`recipe:patient:${recipe.patientId}`);
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error al actualizar la receta: ${error.message}`,
      );
    }
  }

  /**
   * Marcar una receta como dispensada
   * @param id - ID de la receta
   * @param userId - ID del usuario que marca como dispensada
   * @returns Receta actualizada
   */
  async markAsDispensed(id: string, userId?: string): Promise<Recipe> {
    try {
      const recipe = await this.recipeRepository.findOne({
        where: { id },
      });

      if (!recipe) {
        throw new NotFoundException(
          `Receta con ID ${id} no encontrada.`,
        );
      }

      if (recipe.status !== 'active') {
        throw new BadRequestException(
          'Solo se pueden marcar como dispensadas las recetas activas.',
        );
      }

      await this.recipeRepository.update(id, {
        status: 'dispensed',
        updatedBy: userId,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`recipe:${id}`);
      await this.cacheManager.del(`recipe:patient:${recipe.patientId}`);
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error al marcar la receta como dispensada: ${error.message}`,
      );
    }
  }

  /**
   * Cancelar una receta médica
   * @param id - ID de la receta
   * @param userId - ID del usuario que cancela
   * @returns Receta actualizada
   */
  async cancel(id: string, userId?: string): Promise<Recipe> {
    try {
      const recipe = await this.recipeRepository.findOne({
        where: { id },
      });

      if (!recipe) {
        throw new NotFoundException(
          `Receta con ID ${id} no encontrada.`,
        );
      }

      if (recipe.status === 'dispensed') {
        throw new BadRequestException(
          'No se puede cancelar una receta que ya ha sido dispensada.',
        );
      }

      await this.recipeRepository.update(id, {
        status: 'cancelled',
        isActive: false,
        updatedBy: userId,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`recipe:${id}`);
      await this.cacheManager.del(`recipe:patient:${recipe.patientId}`);
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Error al cancelar la receta: ${error.message}`,
      );
    }
  }

  /**
   * Eliminar una receta médica (soft delete)
   * @param id - ID de la receta a eliminar
   */
  async remove(id: string): Promise<void> {
    try {
      const recipe = await this.findOne(id);

      if (!recipe) {
        throw new NotFoundException(
          `Receta con ID ${id} no encontrada.`,
        );
      }

      // Soft delete
      await this.recipeRepository.update(id, {
        deletedAt: new Date(),
        isActive: false,
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`recipe:${id}`);
      await this.cacheManager.del(`recipe:patient:${recipe.patientId}`);
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(
        `Error al eliminar la receta: ${error.message}`,
      );
    }
  }
}
