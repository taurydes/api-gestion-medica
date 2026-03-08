import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entidad MedicalHistory (Historial Médico)
 * Schema: public
 * Tabla: medical_histories
 *
 * Representa el registro de cada consulta médica del paciente
 * incluyendo la reseña/diagnóstico dado por el médico
 */
@Entity({ schema: 'public', name: 'medical_histories' })
export class MedicalHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ========== RELACIONES PRINCIPALES ==========

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  @Column({ name: 'medical_center_id', type: 'uuid', nullable: true })
  medicalCenterId: string | null;

  @ManyToOne(() => MedicalCenter, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;

  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId: string | null;

  @ManyToOne(() => Specialty, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'specialty_id' })
  specialty: Specialty;

  // ========== DATOS DE LA CONSULTA ==========

  @Column({ name: 'consultation_date', type: 'timestamp' })
  consultationDate: Date;

  @Column({
    name: 'consultation_number',
    type: 'varchar',
    length: 50,
    unique: true,
  })
  consultationNumber: string; // Número único de consulta (ej: CONS-2026-00001)

  @Column({ name: 'reason_for_visit', type: 'text' })
  reasonForVisit: string; // Motivo de la consulta

  @Column({ name: 'symptoms', type: 'text', nullable: true })
  symptoms: string | null; // Síntomas presentados por el paciente

  @Column({ name: 'physical_examination', type: 'text', nullable: true })
  physicalExamination: string | null; // Resultados del examen físico

  // ========== SIGNOS VITALES ==========

  @Column({
    name: 'blood_pressure',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  bloodPressure: string | null; // Presión arterial (ej: "120/80")

  @Column({ name: 'heart_rate', type: 'int', nullable: true })
  heartRate: number | null; // Frecuencia cardíaca (ppm)

  @Column({
    name: 'temperature',
    type: 'decimal',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  temperature: number | null; // Temperatura corporal (°C)

  @Column({
    name: 'weight',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  weight: number | null; // Peso (kg)

  @Column({
    name: 'height',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  height: number | null; // Altura (cm)

  @Column({ name: 'respiratory_rate', type: 'int', nullable: true })
  respiratoryRate: number | null; // Frecuencia respiratoria

  @Column({
    name: 'oxygen_saturation',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  oxygenSaturation: number | null; // Saturación de oxígeno (%)

  // ========== DIAGNÓSTICO Y TRATAMIENTO ==========

  @Column({ name: 'diagnosis', type: 'text', nullable: true })
  diagnosis: string | null; // Diagnóstico del médico

  @Column({
    name: 'diagnosis_code',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  diagnosisCode: string | null; // Código CIE-10 del diagnóstico

  @Column({ name: 'treatment_plan', type: 'text', nullable: true })
  treatmentPlan: string | null; // Plan de tratamiento

  @Column({ name: 'observations', type: 'text', nullable: true })
  observations: string | null; // Observaciones adicionales

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate: Date | null; // Fecha de próxima cita de seguimiento

  @Column({ name: 'follow_up_notes', type: 'text', nullable: true })
  followUpNotes: string | null; // Notas para el seguimiento

  // ========== ESTADO ==========

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'in_progress',
  })
  status: string; // 'in_progress', 'completed', 'cancelled'

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ========== AUDITORÍA ==========

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

  // ========== RELACIÓN CON CITA MÉDICA ==========

  @Column({ name: 'medical_appointment_id', type: 'uuid', nullable: true })
  medicalAppointmentId: string | null;

  // Relación inversa con MedicalAppointment (1:1 opcional)
  // Se usa 'any' para evitar importación circular; la relación se define
  // en MedicalAppointment con OneToOne(() => MedicalHistory)
  @OneToOne('MedicalAppointment', 'medicalHistory', {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'medical_appointment_id' })
  medicalAppointment: any;
}
