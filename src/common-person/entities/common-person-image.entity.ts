import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommonPerson } from './common-person.entity';

/**
 * Entidad CommonPersonImage (Foto de persona común / paciente)
 * Schema: public
 * Tabla: common_person_images
 *
 * Almacena referencias a imágenes de perfil asociadas a personas comunes (pacientes).
 * Los archivos se guardan en: UPLOADS_PATH/common-persons/{commonPersonId}/
 */
@Entity({ schema: 'public', name: 'common_person_images' })
export class CommonPersonImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'common_person_id', type: 'uuid' })
  commonPersonId: string;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 255 })
  storedName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

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

  @ManyToOne(() => CommonPerson)
  @JoinColumn({ name: 'common_person_id' })
  commonPerson: CommonPerson;
}
