import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Municipality } from './municipality.entity';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';

/**
 * Parroquia → Parish
 * Representa una parroquia perteneciente a un municipio.
 */
@Entity({ schema: 'parametro', name: 'parroquia' })
export class Parish {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'municipio_id', type: 'bigint' })
  municipalityId: number;

  @Column({ name: 'descripcion', type: 'varchar', length: 255 })
  description: string;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // 🔗 Many Parishes → 1 Municipality
  @ManyToOne(() => Municipality, (m) => m.parishes, {
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'municipio_id' })
  municipality: Municipality;

  @OneToMany(() => MedicalCenter, (center) => center.parish)
  medicalCenters: MedicalCenter[];
}
