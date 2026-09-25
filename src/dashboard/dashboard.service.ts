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
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import { AuthContextService } from 'src/common/services/auth-context.service';

/** Alcance de las consultas: admin ve todo, un doctor sus citas y el resto nada. */
interface DashboardScope {
  isAdmin: boolean;
  doctorId: string | null;
}

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

    @InjectRepository(AppointmentFile, DatabaseConnectionName.DB_MAIN)
    private readonly appointmentFileRepo: Repository<AppointmentFile>,

    private readonly authContextService: AuthContextService,
  ) {}

  private async resolveScope(authUser: any): Promise<DashboardScope> {
    const userId = authUser?.id;
    if (!userId) return { isAdmin: false, doctorId: null };
    if (await this.authContextService.isAdmin(userId)) {
      return { isAdmin: true, doctorId: null };
    }
    return {
      isAdmin: false,
      doctorId: await this.authContextService.getDoctorIdForUser(userId),
    };
  }

  /** Aplica el alcance sobre una consulta de citas con el alias indicado. */
  private applyScope(qb: any, scope: DashboardScope, doctorColumn: string): void {
    if (scope.isAdmin) return;
    if (scope.doctorId) {
      qb.andWhere(`${doctorColumn} = :doctorId`, { doctorId: scope.doctorId });
      return;
    }
    // Sin perfil de doctor ni permiso de admin: no hay centros asignados que mostrar
    qb.andWhere('1 = 0');
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
    const doctorId = scope.doctorId;
    const medicalCenterIds = doctorId
      ? await this.getMedicalCenterIdsForDoctor(doctorId)
      : [];

    // Base queries
    const appointmentQb = this.appointmentRepo
      .createQueryBuilder('a')
      .where('a.deletedAt IS NULL');

    const patientQb = this.patientRepo
      .createQueryBuilder('p')
      .where('p.deletedAt IS NULL');

    const recipeQb = this.recipeRepo
      .createQueryBuilder('r')
      .where('r.deletedAt IS NULL');

    const historyQb = this.medicalHistoryRepo
      .createQueryBuilder('h')
      .where('h.deletedAt IS NULL');

    // Si es doctor, filtrar solo sus datos
    this.applyScope(appointmentQb, scope, 'a.doctorId');
    this.applyScope(recipeQb, scope, 'r.doctorId');
    this.applyScope(historyQb, scope, 'h.doctorId');

    // Conteos
    const mlQb = this.appointmentFileRepo
      .createQueryBuilder('af')
      .where('af.deletedAt IS NULL')
      .andWhere("af.fileType = 'mammography'");

    if (doctorId) {
      mlQb.innerJoin('af.medicalAppointment', 'apt');
    }
    this.applyScope(mlQb, scope, 'apt.doctorId');

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
      this.doctorRepo.createQueryBuilder('d').where('d.deletedAt IS NULL').getCount(),
      this.medicalCenterRepo.createQueryBuilder('mc').where('mc.deletedAt IS NULL').getCount(),
      this.departmentRepo.createQueryBuilder('dp').where('dp.deletedAt IS NULL').getCount(),
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

    this.applyScope(todayQb, scope, 'a.doctorId');

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

    this.applyScope(qb, scope, 'a.doctorId');

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

    this.applyScope(qb, scope, 'a.doctorId');

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

    this.applyScope(qb, scope, 'a.doctorId');

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
