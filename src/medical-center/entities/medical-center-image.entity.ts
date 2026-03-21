import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MedicalCenter } from './medical-center.entity';

/**
 * Entidad MedicalCenterImage (Imagen de centro médico)
 * Schema: parametro
 * Tabla: medical_center_images
 *
 * Almacena referencias a imágenes asociadas a centros médicos
 * (logo, fachada, interior, equipamiento, etc.).
 * Los archivos se guardan en el sistema de archivos del servidor
 * en la ruta: UPLOADS_PATH/medical-centers/{medicalCenterId}/
 */
@Entity({ schema: 'parametro', name: 'medical_center_images' })
export class MedicalCenterImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'medical_center_id', type: 'uuid' })
  medicalCenterId: string;

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

  /** Tipo de imagen: logo, facade, interior, equipment, general, other */
  @Column({
    name: 'image_type',
    type: 'varchar',
    length: 50,
    default: 'general',
  })
  imageType: string;

  /** Descripción o notas sobre la imagen */
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

  // ─── Relaciones ───────────────────────────────────────────────────────────
  @ManyToOne(() => MedicalCenter, (mc) => mc.images)
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;
}
