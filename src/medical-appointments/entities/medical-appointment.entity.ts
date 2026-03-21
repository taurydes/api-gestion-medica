import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Department } from 'src/departments/entities/department.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';

export enum AppointmentStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_CONSULTATION = 'in_consultation',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum AppointmentType {
  FIRST_VISIT = 'first_visit',
  FOLLOW_UP = 'follow_up',
  EMERGENCY = 'emergency',
}

/**
 * Entidad MedicalAppointment (Cita médica)
 * Schema: public
 * Tabla: medical_appointments
 *
 * Representa una cita médica programada y sirve como hub central
 * que vincula pacientes, médicos, especialidades, historial clínico,
 * recetas y demás registros derivados de la consulta.
 */
@Entity({ schema: 'public', name: 'medical_appointments' })
export class MedicalAppointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Número de cita ────────────────────────────────────────────────────────

  @Column({
    name: 'appointment_number',
    type: 'varchar',
    length: 50,
    unique: true,
  })
  appointmentNumber: string; // Ej: APT-2026-00001

  // ─── Datos de la cita ──────────────────────────────────────────────────────

  @Column({ name: 'appointment_date', type: 'timestamp' })
  appointmentDate: Date;

  @Column({ name: 'duration_minutes', type: 'int', default: 30 })
  durationMinutes: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: AppointmentStatus.PENDING,
  })
  status: AppointmentStatus;

  @Column({
    name: 'type',
    type: 'varchar',
    length: 20,
    default: AppointmentType.FIRST_VISIT,
  })
  type: AppointmentType;

  @Column({ name: 'reason', type: 'text' })
  reason: string;

  @Column({ name: 'observations', type: 'text', nullable: true })
  observations: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason: string | null;

  // ─── FKs ───────────────────────────────────────────────────────────────────

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;

  @Column({ name: 'medical_center_id', type: 'uuid', nullable: true })
  medicalCenterId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  // ─── Auditoría ─────────────────────────────────────────────────────────────

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  // ─── Relaciones ────────────────────────────────────────────────────────────

  @ManyToOne(() => Patient, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @ManyToOne(() => Specialty, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'specialty_id' })
  specialty: Specialty;

  @ManyToOne(() => MedicalCenter, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;

  @ManyToOne(() => Department, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  // Relación inversa con historial médico (1:1 opcional)
  @OneToOne(() => MedicalHistory, (history) => history.medicalAppointment, {
    nullable: true,
  })
  medicalHistory: MedicalHistory;

  // Relación inversa con recetas (1:N)
  @OneToMany(() => Recipe, (recipe) => recipe.medicalAppointment)
  recipes: Recipe[];

  @OneToMany(() => AppointmentFile, (file) => file.medicalAppointment)
  appointmentFiles: AppointmentFile[];
}
