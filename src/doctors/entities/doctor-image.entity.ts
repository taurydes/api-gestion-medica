import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Doctor } from './doctor.entity';

/**
 * Entidad DoctorImage (Foto de doctor)
 * Schema: public
 * Tabla: doctor_images
 *
 * Almacena referencias a imágenes de perfil asociadas a doctores.
 * Los archivos se guardan en el sistema de archivos del servidor
 * en la ruta: UPLOADS_PATH/doctors/{doctorId}/
 */
@Entity({ schema: 'public', name: 'doctor_images' })
export class DoctorImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'doctor_id', type: 'uuid' })
  doctorId: string;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  /** Nombre original del archivo subido */
  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  /** Nombre almacenado en el servidor (incluye timestamp y sufijo aleatorio para evitar colisiones) */
  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName: string;

  /** MIME type del archivo (ej: image/webp, image/png, image/jpeg) */
  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  /** Tamaño del archivo en bytes */
  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  /** Ruta relativa al UPLOADS_PATH donde se almacenó el archivo */
  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // ─── Relaciones ───────────────────────────────────────────────────────────
  @ManyToOne(() => Doctor)
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;
}
