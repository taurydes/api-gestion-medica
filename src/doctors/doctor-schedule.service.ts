import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { IsNull, Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DoctorSchedule } from './entities/doctor-schedule.entity';
import { Doctor } from './entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import {
  CreateDoctorScheduleDto,
  UpdateDoctorScheduleBlockDto,
} from './dto/doctor-schedule.dto';

@Injectable()
export class DoctorScheduleService {
  constructor(
    @InjectRepository(DoctorSchedule, DatabaseConnectionName.DB_MAIN)
    private readonly scheduleRepo: Repository<DoctorSchedule>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepo: Repository<Doctor>,

    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepo: Repository<MedicalCenter>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * Crea o reemplaza todos los horarios de un doctor en un centro médico.
   * Se hace soft-delete de los horarios anteriores y se crean los nuevos.
   */
  async setSchedule(dto: CreateDoctorScheduleDto): Promise<DoctorSchedule[]> {
    // Validar que el doctor exista
    const doctor = await this.doctorRepo.findOne({
      where: { id: dto.doctorId, deletedAt: IsNull() },
    });
    if (!doctor) {
      throw new NotFoundException(`Doctor con ID ${dto.doctorId} no encontrado`);
    }

    // Validar que el centro médico exista
    const center = await this.medicalCenterRepo.findOne({
      where: { id: dto.medicalCenterId, deletedAt: IsNull() },
    });
    if (!center) {
      throw new NotFoundException(
        `Centro médico con ID ${dto.medicalCenterId} no encontrado`,
      );
    }

    // Validar bloques horarios (hora fin > hora inicio)
    for (const block of dto.blocks) {
      if (block.startTime >= block.endTime) {
        throw new BadRequestException(
          `La hora de inicio (${block.startTime}) debe ser anterior a la hora de fin (${block.endTime})`,
        );
      }
    }

    // Soft-delete de horarios anteriores del doctor en este centro
    await this.scheduleRepo.update(
      {
        doctorId: dto.doctorId,
        medicalCenterId: dto.medicalCenterId,
        deletedAt: IsNull(),
      },
      { deletedAt: new Date() },
    );

    // Crear nuevos horarios
    const schedules = dto.blocks.map((block) =>
      this.scheduleRepo.create({
        doctorId: dto.doctorId,
        medicalCenterId: dto.medicalCenterId,
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        slotDurationMinutes: block.slotDurationMinutes ?? 30,
        maxPatientsPerSlot: block.maxPatientsPerSlot ?? 1,
        isActive: true,
      }),
    );

    const saved = await this.scheduleRepo.save(schedules);

    // Limpiar caché
    await this.invalidateCache(dto.doctorId, dto.medicalCenterId);

    return saved;
  }

  /**
   * Obtiene los horarios de un doctor, opcionalmente filtrado por centro médico.
   */
  async getSchedulesByDoctor(
    doctorId: string,
    medicalCenterId?: string,
  ): Promise<DoctorSchedule[]> {
    const cacheKey = `doctor-schedules:${doctorId}:${medicalCenterId || 'all'}`;
    const cached = await this.cacheManager.get<DoctorSchedule[]>(cacheKey);
    if (cached) return cached;

    const where: any = {
      doctorId,
      deletedAt: IsNull(),
      isActive: true,
    };

    if (medicalCenterId) {
      where.medicalCenterId = medicalCenterId;
    }

    const schedules = await this.scheduleRepo.find({
      where,
      relations: ['medicalCenter'],
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });

    await this.cacheManager.set(cacheKey, schedules, 300);
    return schedules;
  }

  /**
   * Obtiene los horarios de un doctor para un día específico.
   * Útil para validar disponibilidad al crear citas.
   */
  async getScheduleForDoctorOnDay(
    doctorId: string,
    medicalCenterId: string,
    dayOfWeek: number,
  ): Promise<DoctorSchedule[]> {
    return this.scheduleRepo.find({
      where: {
        doctorId,
        medicalCenterId,
        dayOfWeek,
        isActive: true,
        deletedAt: IsNull(),
      },
      order: { startTime: 'ASC' },
    });
  }

  /**
   * Actualiza un bloque horario específico.
   */
  async updateBlock(
    blockId: string,
    dto: UpdateDoctorScheduleBlockDto,
  ): Promise<DoctorSchedule> {
    const block = await this.scheduleRepo.findOne({
      where: { id: blockId, deletedAt: IsNull() },
    });

    if (!block) {
      throw new NotFoundException(`Bloque horario con ID ${blockId} no encontrado`);
    }

    // Validar hora si se actualizan
    const startTime = dto.startTime || block.startTime;
    const endTime = dto.endTime || block.endTime;
    if (startTime >= endTime) {
      throw new BadRequestException(
        'La hora de inicio debe ser anterior a la hora de fin',
      );
    }

    Object.assign(block, dto);
    block.updatedAt = new Date();
    const saved = await this.scheduleRepo.save(block);

    await this.invalidateCache(block.doctorId, block.medicalCenterId);
    return saved;
  }

  /**
   * Elimina (soft delete) un bloque horario.
   */
  async removeBlock(blockId: string): Promise<void> {
    const block = await this.scheduleRepo.findOne({
      where: { id: blockId, deletedAt: IsNull() },
    });

    if (!block) {
      throw new NotFoundException(`Bloque horario con ID ${blockId} no encontrado`);
    }

    block.deletedAt = new Date();
    await this.scheduleRepo.save(block);

    await this.invalidateCache(block.doctorId, block.medicalCenterId);
  }

  private async invalidateCache(
    doctorId: string,
    medicalCenterId: string,
  ): Promise<void> {
    await this.cacheManager.del(`doctor-schedules:${doctorId}:all`);
    await this.cacheManager.del(
      `doctor-schedules:${doctorId}:${medicalCenterId}`,
    );
  }
}
