import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { User } from 'src/user/entities/user.entity';
import { AuthContextService, DataScope } from 'src/common/services/auth-context.service';
import { MammographyAnalysis } from 'src/mammography-analysis/entities/mammography-analysis.entity';
import { applyPatientScope } from 'src/patient/patient-scope';

/**
 * Servicio de dashboard con estadísticas reales.
 * Filtra datos según el rol del usuario autenticado.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(MedicalAppointment, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentRepo: Repository<MedicalAppointment>,

    @InjectRepository(Patient, DatabaseConnectionName.DB_MAIN)
    private readonly patientRepo: Repository<Patient>,

    @InjectRepository(Doctor, DatabaseConnectionName.DB_MAIN)
    private readonly doctorRepo: Repository<Doctor>,

    @InjectRepository(MedicalCenter, DatabaseConnectionName.DB_MAIN)
    private readonly medicalCenterRepo: Repository<MedicalCenter>,

    @InjectRepository(Department, DatabaseConnectionName.DB_MAIN)
    private readonly departmentRepo: Repository<Department>,

    @InjectRepository(Recipe, DatabaseConnectionName.DB_MAIN)
    private readonly recipeRepo: Repository<Recipe>,

    @InjectRepository(MedicalHistory, DatabaseConnectionName.DB_MAIN)
    private readonly medicalHistoryRepo: Repository<MedicalHistory>,

    @InjectRepository(User, DatabaseConnectionName.DB_MAIN)
    private readonly userRepo: Repository<User>,

    private readonly authContextService: AuthContextService,

    @InjectRepository(MammographyAnalysis, DatabaseConnectionName.DB_MAIN)
    private readonly analysisRepo: Repository<MammographyAnalysis>,
  ) {}

  /** Admin: null (everything); doctor: their doctorId; other staff: their assigned centers (MJ-38). */
  private async resolveScope(authUser: any): Promise<DataScope | null> {
    return this.authContextService.resolveScope(authUser?.id);
  }

  /**
   * Bounds a query by the doctor column or, for staff, by the center column. A staff user without
   * centers, or a query with no center column for staff (null), sees nothing.
   */
  private applyScope(qb: any, scope: DataScope | null, doctorColumn: string, centerColumn: string | null = null): void {
    if (!scope) return;
    if (scope.doctorId) {
      qb.andWhere(`${doctorColumn} = :doctorId`, { doctorId: scope.doctorId });
      return;
    }
    if (centerColumn && scope.centerIds?.length) {
      qb.andWhere(`${centerColumn} IN (:...scopeCenterIds)`, { scopeCenterIds: scope.centerIds });
      return;
    }
    qb.andWhere('1 = 0');
  }

  /** Centers that bound a non-admin: the doctor's or the staff user's. */
  private async scopeCenterIds(scope: DataScope | null): Promise<string[]> {
    if (!scope) return [];
    return scope.doctorId ? this.getMedicalCenterIdsForDoctor(scope.doctorId) : scope.centerIds ?? [];
  }

  /**
   * Obtiene los centros médicos asociados a un doctor.
   */
  private async getMedicalCenterIdsForDoctor(doctorId: string): Promise<string[]> {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['medicalCenters'],
    });
    return doctor?.medicalCenters?.map((mc) => mc.id) ?? [];
  }

  /**
   * Estadísticas generales del sistema
   */
  async getStats(authUser: any) {
    const scope = await this.resolveScope(authUser);
    const doctorId = scope?.doctorId ?? null;
    const medicalCenterIds = await this.scopeCenterIds(scope);

    // Base queries
    const appointmentQb = this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.deletedAt IS NULL');

    // Same bound as the patient list (MJ-45): no longer the global count for a doctor
    const patientQb = this.patientRepo
      .createQueryBuilder('patient')
      .where('patient.deletedAt IS NULL');
    applyPatientScope(patientQb, scope);

    const recipeQb = this.recipeRepo
      .createQueryBuilder('r')
      .where('r.deletedAt IS NULL');

    const historyQb = this.medicalHistoryRepo
      .createQueryBuilder('h')
      .where('h.deletedAt IS NULL');

    // Doctor: own data; staff: their centers' appointments and histories (recipes carry no center)
    this.applyScope(appointmentQb, scope, 'a.doctorId', 'a.medicalCenterId');
    this.applyScope(recipeQb, scope, 'r.doctorId');
    this.applyScope(historyQb, scope, 'h.doctorId', 'h.medicalCenterId');

    // Analyses, not mammography files: the figure now matches the review inbox (MJ-45)
    const mlQb = this.analysisRepo
      .createQueryBuilder('ma')
      .leftJoin('ma.appointment', 'apt')
      .where('ma.deletedAt IS NULL');
    if (scope?.doctorId) {
      // Own appointments plus the standalone analyses the doctor ran, as in the inbox
      mlQb.andWhere('(apt.doctorId = :doctorId OR (ma.appointmentId IS NULL AND ma.analyzedBy = :userId))', {
        doctorId: scope.doctorId,
        userId: scope.userId,
      });
    } else {
      this.applyScope(mlQb, scope, 'apt.doctorId', 'apt.medicalCenterId');
    }

    // Catalog figures are bounded to the user's centers for a non-admin (MJ-45)
    const doctorQb = this.doctorRepo.createQueryBuilder('d').where('d.deletedAt IS NULL');
    const centerQb = this.medicalCenterRepo.createQueryBuilder('mc').where('mc.deletedAt IS NULL');
    const departmentQb = this.departmentRepo.createQueryBuilder('dp').where('dp.deletedAt IS NULL');
    if (scope) {
      const ids = medicalCenterIds.length ? medicalCenterIds : ['00000000-0000-0000-0000-000000000000'];
      doctorQb.innerJoin('d.medicalCenters', 'dmc', 'dmc.id IN (:...ids)', { ids }).distinct(true);
      centerQb.andWhere('mc.id IN (:...ids)', { ids });
      departmentQb.andWhere('dp.medicalCenterId IN (:...ids)', { ids });
    }

    const [
      totalAppointments,
      pendingAppointments,
      completedAppointments,
      cancelledAppointments,
      totalPatients,
      totalDoctors,
      totalMedicalCenters,
      totalDepartments,
      totalRecipes,
      totalHistories,
      totalMlAnalyses,
    ] = await Promise.all([
      appointmentQb.clone().getCount(),
      appointmentQb.clone().andWhere("a.status = 'pending'").getCount(),
      appointmentQb.clone().andWhere("a.status = 'completed'").getCount(),
      appointmentQb.clone().andWhere("a.status = 'cancelled'").getCount(),
      patientQb.getCount(),
      doctorQb.getCount(),
      centerQb.getCount(),
      departmentQb.getCount(),
      recipeQb.getCount(),
      historyQb.getCount(),
      mlQb.getCount(),
    ]);

    // Citas de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayQb = this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.deletedAt IS NULL')
      .andWhere('a.appointmentDate >= :today', { today })
      .andWhere('a.appointmentDate < :tomorrow', { tomorrow });

    this.applyScope(todayQb, scope, 'a.doctorId', 'a.medicalCenterId');

    const todayAppointments = await todayQb.getCount();

    return {
      totalAppointments,
      pendingAppointments,
      completedAppointments,
      cancelledAppointments,
      todayAppointments,
      totalPatients,
      totalDoctors,
      totalMedicalCenters,
      totalDepartments,
      totalRecipes,
      totalHistories,
      totalMlAnalyses,
      // Indicar si el usuario es doctor (para que frontend ajuste la vista)
      isDoctor: !!doctorId,
      doctorId,
      medicalCenterIds,
      // global (admin), doctor (own data) or centers (staff bounded by their centers)
      scope: !scope ? 'global' : scope.doctorId ? 'doctor' : 'centers',
    };
  }

  /**
   * Citas recientes (últimas 10)
   */
  async getRecentAppointments(authUser: any) {
    const scope = await this.resolveScope(authUser);

    const qb = this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'patient')
      .leftJoinAndSelect('a.doctor', 'doctor')
      .leftJoinAndSelect('doctor.commonPerson', 'doctorPerson')
      .leftJoinAndSelect('a.specialty', 'specialty')
      .leftJoinAndSelect('a.medicalCenter', 'medicalCenter')
      .where('a.deletedAt IS NULL')
      .orderBy('a.appointmentDate', 'DESC')
      .take(10);

    this.applyScope(qb, scope, 'a.doctorId', 'a.medicalCenterId');

    return qb.getMany();
  }

  /**
   * Distribución de citas por estado
   */
  async getAppointmentsByStatus(authUser: any) {
    const scope = await this.resolveScope(authUser);

    const qb = this.appointmentRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('a.deletedAt IS NULL')
      .groupBy('a.status');

    this.applyScope(qb, scope, 'a.doctorId', 'a.medicalCenterId');

    return qb.getRawMany();
  }

  /**
   * Citas por mes del año actual
   */
  async getAppointmentsByMonth(authUser: any) {
    const scope = await this.resolveScope(authUser);

    const year = new Date().getFullYear();

    const qb = this.appointmentRepo
      .createQueryBuilder('a')
      .select("EXTRACT(MONTH FROM a.appointmentDate)", 'month')
      .addSelect('COUNT(*)', 'count')
      .where('a.deletedAt IS NULL')
      .andWhere("EXTRACT(YEAR FROM a.appointmentDate) = :year", { year })
      .groupBy("EXTRACT(MONTH FROM a.appointmentDate)")
      .orderBy("EXTRACT(MONTH FROM a.appointmentDate)", 'ASC');

    this.applyScope(qb, scope, 'a.doctorId', 'a.medicalCenterId');

    const raw = await qb.getRawMany();

    // Llenar los 12 meses
    const months = Array.from({ length: 12 }, (_, i) => {
      const found = raw.find((r) => Number(r.month) === i + 1);
      return {
        month: i + 1,
        count: found ? Number(found.count) : 0,
      };
    });

    return months;
  }
}
