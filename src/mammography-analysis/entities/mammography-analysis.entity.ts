import { Patient } from 'src/patient/entities/patient.entity';
import { User } from 'src/user/entities/user.entity';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { AppointmentFile } from 'src/files/entities/appointment-file.entity';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';

export enum MammographyAnalysisPrediction {
  MALIGNANT = 'MALIGNANT',
  BENIGN = 'BENIGN',
}

/** `pg` returns numeric as string; the API exposes numbers. */
const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null || value === undefined ? null : Number(value)),
};

export enum MammographyAnalysisStatus {
  DANGER = 'danger',
  SUCCESS = 'success',
}

/**
 * Entidad MammographyAnalysis (Análisis ML de mamografía)
 * Schema: public
 * Tabla: mammography_analyses
 *
 * Persiste cada ejecución del clasificador de cáncer de mama: una cita puede
 * tener varios análisis, pero cada archivo vivo tiene uno solo (MJ-44). La probabilidad
 * permite ordenar la bandeja de revisión por gravedad.
 */
export const DOCTOR_AGREEMENTS = ['accepted', 'rejected', 'uncertain'] as const;
export type DoctorAgreement = (typeof DOCTOR_AGREEMENTS)[number];

@Entity({ schema: 'public', name: 'mammography_analyses' })
@Index('idx_mammography_analyses_created_at', ['createdAt'])
@Index('idx_mammography_analyses_appointment', ['appointmentId'])
@Index('UQ_mammography_analyses_file_active', ['appointmentFileId'], {
  unique: true,
  where: '"appointment_file_id" IS NOT NULL AND "deleted_at" IS NULL',
})
@Check('CHK_mammography_analyses_doctor_agreement', `"doctor_agreement" IN ('accepted', 'rejected', 'uncertain')`)
@Check('CHK_mammography_analyses_review_agreement', `"review_agreement" IN ('accepted', 'rejected', 'uncertain')`)
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

  /** Confianza del modelo en la clase predicha (0-100), no la probabilidad de malignidad. */
  @Column({
    name: 'probability',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  probability: number;

  /** Probabilidad de malignidad (0-100); es la que usa el filtro `minProbability`. */
  @Column({
    name: 'malignancy_probability',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  malignancyProbability: number | null;

  /** Salida cruda de la sigmoide (0-1): permite recalcular si cambia el orden de clases. */
  @Column({ name: 'raw_score', type: 'double precision', nullable: true })
  rawScore: number | null;

  @Column({ name: 'threshold', type: 'double precision', nullable: true })
  threshold: number | null;

  @Column({ name: 'model_version', type: 'varchar', length: 100, nullable: true })
  modelVersion: string | null;

  /** Nota libre del médico al registrar el análisis. */
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

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

  /** Agreement of the consulting doctor with the model, structured for concordance (MJ-33). */
  @Column({ name: 'doctor_agreement', type: 'varchar', length: 10, nullable: true })
  doctorAgreement: DoctorAgreement | null;

  /** Agreement of the reviewer with the model (MJ-33). */
  @Column({ name: 'review_agreement', type: 'varchar', length: 10, nullable: true })
  reviewAgreement: DoctorAgreement | null;

  // ─── Auditoría ─────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  /** Why an analysis made by mistake was withdrawn, and by whom (MJ-37). */
  @Column({ name: 'deletion_reason', type: 'text', nullable: true })
  deletionReason: string | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

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

  /**
   * Usuario que disparó el análisis (FK a `public.users`). El service valida
   * que el id realmente exista antes de asignarlo; si no, guarda `null` y
   * deja constancia en logs.
   */
  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'analyzed_by' })
  analyst: User | null;
}
