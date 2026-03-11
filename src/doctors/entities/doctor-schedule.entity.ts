import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Doctor } from './doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';

/**
 * Entidad DoctorSchedule (Horario de Doctor)
 * Schema: public
 * Tabla: doctor_schedules
 *
 * Representa los horarios de disponibilidad de un doctor en un centro médico.
 * Cada registro indica un bloque horario en un día de la semana.
 */
@Entity({ schema: 'public', name: 'doctor_schedules' })
export class DoctorSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @Column({ name: 'medical_center_id', type: 'uuid' })
  medicalCenterId: string;

  /** Día de la semana: 0=Domingo, 1=Lunes, ..., 6=Sábado */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number;

  /** Hora de inicio en formato HH:mm (24h) */
  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  /** Hora de fin en formato HH:mm (24h) */
  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  /** Duración de la consulta en minutos (por defecto 30) */
  @Column({ name: 'slot_duration_minutes', type: 'int', default: 30 })
  slotDurationMinutes: number;

  /** Máximo de pacientes por bloque (por defecto 1) */
  @Column({ name: 'max_patients_per_slot', type: 'int', default: 1 })
  maxPatientsPerSlot: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // ========== RELACIONES ==========

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @ManyToOne(() => MedicalCenter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;
}
