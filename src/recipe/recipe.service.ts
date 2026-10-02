import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import {
  APPOINTMENT_CACHE_REGISTRY,
  CACHE_TTL,
  cacheAndRemember,
  clearRegistry,
} from 'src/common/cache/cache-registry';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Medication } from 'src/parameters/entities/medication.entity';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { RecipeQueryDto } from './dto/recipe-query.dto';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesService } from 'src/files/files.service';
import { AuthContextService } from 'src/common/services/auth-context.service';
import { toHttpException } from 'src/common/exceptions/to-http-exception';

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

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepository: Repository<User>,

    private readonly filesService: FilesService,

    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,

    private readonly authContextService: AuthContextService,
  ) {}

  private async enrichWithImages(record: any): Promise<any> {
    const [patientImageUrl, doctorImageUrl] = await Promise.all([
      record.patient?.commonPersonId
        ? this.filesService.getLatestCommonPersonImageUrl(record.patient.commonPersonId)
        : Promise.resolve(null),
      record.doctor?.id
        ? this.filesService.getLatestDoctorImageUrl(record.doctor.id)
        : Promise.resolve(null),
    ]);
    return {
      ...record,
      patient: record.patient ? { ...record.patient, imageUrl: patientImageUrl } : null,
      doctor: record.doctor ? { ...record.doctor, imageUrl: doctorImageUrl } : null,
    };
  }

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
    // Appointment views embed this entity: drop them too
    await clearRegistry(this.cacheManager, APPOINTMENT_CACHE_REGISTRY);
  }

  /**
   * Genera un número de receta único
   * Formato: REC-YYYY-XXXXX (ej: REC-2026-00001)
   */
  private async generateRecipeNumber(
    recipeRepo: Repository<Recipe> = this.recipeRepository,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REC-${year}-`;

    // Obtener el último número de receta del año actual
    const lastRecipe = await recipeRepo
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
  async create(
    dto: CreateRecipeDto,
    userId?: string,
    manager?: EntityManager,
  ): Promise<Recipe> {
    try {
      // Header and items in one transaction; a caller-owned manager (finishConsultation) commits and clears caches.
      const savedRecipe = manager
        ? await this.createWithManager(dto, userId, manager)
        : await this.dataSource.transaction((m) => this.createWithManager(dto, userId, m));
      if (manager) return savedRecipe;

      await this.invalidateCaches(savedRecipe);

      // Retornar con relaciones cargadas
      return this.findOne(savedRecipe.id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw toHttpException(error, 'Error al crear la receta.');
    }
  }

  private async createWithManager(
    dto: CreateRecipeDto,
    userId: string | undefined,
    manager: EntityManager,
  ): Promise<Recipe> {
    // 1️⃣ Verificar que el historial médico exista
    const medicalHistory = await manager.getRepository(MedicalHistory).findOne({
      where: { id: dto.medicalHistoryId, deletedAt: IsNull() },
    });

    if (!medicalHistory) {
      throw new NotFoundException(
        `El historial médico con ID ${dto.medicalHistoryId} no existe o ha sido eliminado.`,
      );
    }

    // 2️⃣ Verificar que el paciente exista
    const patient = await manager.getRepository(Patient).findOne({
      where: { id: dto.patientId, deletedAt: IsNull() },
    });

    if (!patient) {
      throw new NotFoundException(
        `El paciente con ID ${dto.patientId} no existe o ha sido eliminado.`,
      );
    }

    // 3️⃣ Verificar que el doctor exista
    const doctor = await manager.getRepository(Doctor).findOne({
      where: { id: dto.doctorId, deletedAt: IsNull() },
    });

    if (!doctor) {
      throw new NotFoundException(
        `El doctor con ID ${dto.doctorId} no existe o ha sido eliminado.`,
      );
    }

    // 4️⃣ Verificar los medicamentos antes de escribir
    await this.assertMedicationsExist(dto.items, manager);

    // 5️⃣ Generar número de receta único
    const recipeRepo = manager.getRepository(Recipe);
    const recipeNumber = await this.generateRecipeNumber(recipeRepo);

    // 6️⃣ Crear la receta
    const { items, ...recipeData } = dto;

    const newRecipe = recipeRepo.create({
      ...recipeData,
      recipeNumber,
      issueDate: new Date(),
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      status: 'active',
      createdBy: userId,
    });

    const savedRecipe = await recipeRepo.save(newRecipe);

    // 7️⃣ Crear los ítems de la receta
    const itemRepo = manager.getRepository(RecipeItem);
    const recipeItems = items.map((item, index) =>
      itemRepo.create({
        ...item,
        recipeId: savedRecipe.id,
        orderNumber: item.orderNumber ?? index + 1,
      }),
    );

    await itemRepo.save(recipeItems);

    return savedRecipe;
  }

  /** Rejects item medicationIds that do not exist or were soft-deleted, before anything is written. */
  async assertMedicationsExist(
    items: { medicationId?: string | null }[] = [],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const ids = [
      ...new Set(items.map((i) => i.medicationId).filter((id): id is string => !!id)),
    ];
    if (ids.length === 0) return;

    const found = await manager.getRepository(Medication).find({
      select: { id: true },
      where: { id: In(ids), deletedAt: IsNull() },
    });
    const missing = ids.filter((id) => !found.some((m) => m.id === id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Los medicamentos con ID ${missing.join(', ')} no existen o han sido eliminados.`,
      );
    }
  }

  /** Clears the caches a new or changed recipe affects; public so finishConsultation can call it after commit. */
  async invalidateCaches(recipe: Pick<Recipe, 'patientId' | 'medicalHistoryId'>): Promise<void> {
    await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
    await this.cacheManager.del('recipe:all');
    await this.clearQueryCache();
  }

  /**
   * Listar recetas médicas con filtros + paginación + cache.
   * IDOR: si el usuario es doctor, solo ve sus recetas.
   */
  async findAll(query: RecipeQueryDto, authUser?: any) {
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

    // IDOR: forzar filtro por doctorId si el usuario es doctor
    let effectiveDoctorId = doctorId;
    if (authUser?.id) {
      const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
      if (myDoctorId) effectiveDoctorId = myDoctorId;
    }

    const cacheKey = `recipe:query:${JSON.stringify({ ...query, effectiveDoctorId })}`;
    const listKey = 'recipe:query:keys';

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const qb = this.recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.patient', 'patient')
      .leftJoinAndSelect('patient.commonPerson', 'patientPerson')
      .leftJoinAndSelect('recipe.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('recipe.medicalHistory', 'medicalHistory')
      .leftJoinAndSelect('recipe.items', 'items')
      .where('recipe.deletedAt IS NULL');

    if (search) {
      qb.andWhere(
        '(recipe.recipeNumber ILIKE :search OR recipe.diagnosis ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (patientId) qb.andWhere('recipe.patientId = :patientId', { patientId });
    if (effectiveDoctorId) qb.andWhere('recipe.doctorId = :doctorId', { doctorId: effectiveDoctorId });
    if (medicalHistoryId) qb.andWhere('recipe.medicalHistoryId = :medicalHistoryId', { medicalHistoryId });
    if (status) qb.andWhere('recipe.status = :status', { status });
    if (isActive !== undefined) qb.andWhere('recipe.isActive = :isActive', { isActive });
    if (startDate) qb.andWhere('recipe.issueDate >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('recipe.issueDate <= :endDate', { endDate: new Date(endDate) });

    qb.orderBy('recipe.issueDate', order);
    qb.addOrderBy('items.orderNumber', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const enriched = await Promise.all(items.map((r) => this.enrichWithImages(r)));
    const result = { data: enriched, total, page, limit };

    await this.cacheManager.set(cacheKey, result, CACHE_TTL.LIST);
    const keys = (await this.cacheManager.get<string[]>(listKey)) ?? [];
    if (!keys.includes(cacheKey)) {
      keys.push(cacheKey);
      await this.cacheManager.set(listKey, keys, CACHE_TTL.REGISTRY);
    }

    return result;
  }

  /**
   * Obtener una receta médica por ID con cache.
   * IDOR: si el usuario es doctor, valida que sea su receta.
   */
  async findOne(id: string, authUser?: any): Promise<Recipe> {
    const cacheKey = `recipe:${id}`;

    try {
      const cached = await this.cacheManager.get<Recipe>(cacheKey);
      const recipe = cached ?? await this.recipeRepository.findOne({
        where: { id, deletedAt: IsNull() },
        relations: [
          'patient',
          'patient.commonPerson',
          'doctor',
          'doctor.commonPerson',
          'medicalHistory',
          'items',
          'items.medication',
        ],
        order: { items: { orderNumber: 'ASC' } },
      });

      if (!recipe) {
        throw new NotFoundException(`Receta con ID ${id} no encontrada.`);
      }

      // IDOR: validar acceso del doctor
      if (authUser?.id) {
        const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
        if (myDoctorId && recipe.doctorId !== myDoctorId) {
          throw new ForbiddenException('No tiene acceso a esta receta.');
        }
      }

      if (!cached) {
        const enrichedRecipe = await this.enrichWithImages(recipe);
        await this.cacheManager.set(cacheKey, enrichedRecipe, CACHE_TTL.DETAIL);
        return enrichedRecipe;
      }

      return recipe;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) throw error;
      throw toHttpException(error, 'Error al obtener la receta.');
    }
  }

  /**
   * Obtener todas las recetas de un paciente.
   * IDOR: si el usuario es doctor, solo ve recetas donde él es el doctor.
   */
  async findByPatient(patientId: string, authUser?: any): Promise<Recipe[]> {
    try {
      const where: any = { patientId };

      // IDOR: filtrar por doctorId si el usuario es doctor
      if (authUser?.id) {
        const myDoctorId = await this.authContextService.getScopedDoctorId(authUser.id);
        if (myDoctorId) where.doctorId = myDoctorId;
      }

      const recipes = await this.recipeRepository.find({
        where,
        relations: ['doctor', 'doctor.commonPerson', 'medicalHistory', 'items'],
        order: { issueDate: 'DESC' },
      });

      return recipes;
    } catch (error) {
      throw toHttpException(error, 'Error al obtener las recetas del paciente.');
    }
  }

  /**
   * Obtener recetas asociadas a un historial médico específico
   * @param medicalHistoryId - ID del historial médico
   * @returns Lista de recetas del historial
   */
  async findByMedicalHistory(
    medicalHistoryId: string,
    authUser?: any,
  ): Promise<Recipe[]> {
    const cacheKey = `recipe:medical-history:${medicalHistoryId}`;

    try {
      // IDOR: mismo criterio que findByPatient — un doctor solo ve sus recetas.
      // Se filtra después de la caché para no multiplicar claves que hoy se invalidan por historial.
      const myDoctorId = authUser?.id
        ? await this.authContextService.getScopedDoctorId(authUser.id)
        : null;
      const scope = (list: Recipe[]) =>
        myDoctorId ? list.filter((r) => r.doctorId === myDoctorId) : list;

      const cached = await this.cacheManager.get<Recipe[]>(cacheKey);
      if (cached) return scope(cached);

      const recipes = await this.recipeRepository.find({
        where: { medicalHistoryId },
        relations: ['items', 'items.medication'],
        order: { issueDate: 'DESC' },
      });

      await this.cacheManager.set(cacheKey, recipes, CACHE_TTL.LIST);

      return scope(recipes);
    } catch (error) {
      throw toHttpException(error, 'Error al obtener las recetas del historial médico.');
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
        where: { id, deletedAt: IsNull() },
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
      const itemsToWrite = items && items.length > 0 ? items : null;
      if (itemsToWrite) await this.assertMedicationsExist(itemsToWrite);

      // Header and item replacement commit together: a failed save keeps the previous items.
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(Recipe).update(id, {
          ...recipeData,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
          updatedBy: userId,
        });

        if (itemsToWrite) {
          const itemRepo = manager.getRepository(RecipeItem);
          await itemRepo.delete({ recipeId: id });

          const newItems = itemsToWrite.map((item, index) =>
            itemRepo.create({
              ...item,
              recipeId: id,
              orderNumber: item.orderNumber ?? index + 1,
            }),
          );

          await itemRepo.save(newItems);
        }
      });

      // 🧹 Limpiar caches
      await this.cacheManager.del(`recipe:${id}`);
      await this.invalidateCaches(recipe);

      return this.findOne(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw toHttpException(error, 'Error al actualizar la receta.');
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
        where: { id, deletedAt: IsNull() },
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
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw toHttpException(error, 'Error al marcar la receta como dispensada.');
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
        where: { id, deletedAt: IsNull() },
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
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw toHttpException(error, 'Error al cancelar la receta.');
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
      await this.cacheManager.del(`recipe:medical-history:${recipe.medicalHistoryId}`);
      await this.cacheManager.del('recipe:all');
      await this.clearQueryCache();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw toHttpException(error, 'Error al eliminar la receta.');
    }
  }
}
