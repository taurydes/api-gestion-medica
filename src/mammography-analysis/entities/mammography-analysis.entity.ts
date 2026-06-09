import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MammographyAnalysisPrediction {
  MALIGNANT = 'MALIGNANT',
  BENIGN = 'BENIGN',
}

export enum MammographyAnalysisStatus {
  DANGER = 'danger',
  SUCCESS = 'success',
}

/**
 * Entidad MammographyAnalysis (Análisis ML de mamografía)
 * Schema: public
 * Tabla: mammography_analyses
 *
 * Persiste cada ejecución del clasificador de cáncer de mama. Está pensada
 * como un historial completo: cada análisis es una fila — pueden coexistir
 * varios para una misma cita o archivo de mamografía. La probabilidad
 * permite ordenar la bandeja de revisión por gravedad.
 */
@Entity({ schema: 'public', name: 'mammography_analyses' })
@Index('idx_mammography_analyses_created_at', ['createdAt'])
@Index('idx_mammography_analyses_appointment', ['appointmentId'])
export class MammographyAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ─── Vínculos clínicos ─────────────────────────────────────────────────────

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId: string | null;

  @Column({ name: 'appointment_file_id', type: 'uuid', nullable: true })
  appointmentFileId: string | null;

  @Column({ name: 'patient_id', type: 'uuid', nullable: true })
  patientId: string | null;

  /** Usuario (doctor/operador) que disparó el análisis */
  @Column({ name: 'analyzed_by', type: 'uuid', nullable: true })
  analyzedBy: string | null;

  // ─── Resultado del modelo ──────────────────────────────────────────────────

  @Column({
    name: 'prediction',
    type: 'varchar',
    length: 20,
  })
  prediction: MammographyAnalysisPrediction;

  /** Probabilidad 0-100. Decimal para preservar precisión del ML */
  @Column({
    name: 'probability',
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  probability: number;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
  })
  status: MammographyAnalysisStatus;

  /** Etiqueta legible devuelta por el modelo (ej: "Carcinoma ductal") */
  @Column({ name: 'label', type: 'varchar', length: 255, nullable: true })
  label: string | null;

  /** Respuesta cruda del servicio ML (para auditoría/debug) */
  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse: Record<string, any> | null;

  // ─── Imagen analizada ──────────────────────────────────────────────────────

  /**
   * Ruta relativa (dentro de UPLOADS_PATH) a la imagen analizada.
   * Cuando el análisis nace de un appointment_file ya existente, este campo
   * suele duplicar el path para que la bandeja no dependa de joins extra.
   */
  @Column({ name: 'image_path', type: 'varchar', length: 500, nullable: true })
  imagePath: string | null;

  @Column({ name: 'image_mime_type', type: 'varchar', length: 100, nullable: true })
  imageMimeType: string | null;

  /** Nombre original cargado por el usuario (útil cuando viene de DICOM) */
  @Column({ name: 'source_file_name', type: 'varchar', length: 255, nullable: true })
  sourceFileName: string | null;

  // ─── Revisión del médico ───────────────────────────────────────────────────

  @Column({ name: 'is_reviewed', type: 'boolean', default: false })
  isReviewed: boolean;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  // ─── Auditoría ─────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // ─── Relaciones (lectura) ──────────────────────────────────────────────────

  @ManyToOne(() => MedicalAppointment, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'appointment_id' })
  appointment: MedicalAppointment | null;

  @ManyToOne(() => AppointmentFile, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'appointment_file_id' })
  appointmentFile: AppointmentFile | null;

  @ManyToOne(() => Patient, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient | null;

  @ManyToOne(() => Doctor, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'analyzed_by' })
  analyst: Doctor | null;
}
