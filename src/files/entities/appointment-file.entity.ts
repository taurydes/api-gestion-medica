import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entidad AppointmentFile (Archivo de cita médica)
 * Schema: public
 * Tabla: appointment_files
 *
 * Almacena referencias a archivos asociados a citas médicas,
 * como imágenes de mamografía u otros estudios diagnósticos.
 * Los archivos se guardan en el sistema de archivos del servidor
 * en la ruta: UPLOADS_PATH/userId/medicalCenterId/appointmentId/
 */
@Entity({ schema: 'public', name: 'appointment_files' })
export class AppointmentFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'appointment_id', type: 'uuid' })
  appointmentId: string;

  @Column({ name: 'medical_history_id', type: 'uuid', nullable: true })
  medicalHistoryId: string | null;

  @Column({ name: 'patient_id', type: 'uuid' })
  patientId: string;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  /** Nombre original del archivo subido */
  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  /** Nombre almacenado en el servidor (puede incluir UUID para evitar colisiones) */
  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName: string;

  /** MIME type del archivo (ej: image/png, image/jpeg) */
  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  /** Tamaño del archivo en bytes */
  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  /** Ruta relativa al UPLOADS_PATH donde se almacenó el archivo */
  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  /** Tipo de archivo: mammography, exam, report, other */
  @Column({ name: 'file_type', type: 'varchar', length: 50, default: 'other' })
  fileType: string;

  /** Descripción o notas sobre el archivo */
  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
