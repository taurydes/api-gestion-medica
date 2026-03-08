import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Municipality } from './municipality.entity';

/**
 * Estado → State
 * Representa un estado o provincia.
 */
@Entity({ schema: 'parametro', name: 'estado' })
export class State {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'iso', type: 'varchar', length: 255, nullable: true })
  iso: string | null;

  @Column({ name: 'path', type: 'text', nullable: true })
  path: string | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // 🔗 1 State → Many Municipalities
  @OneToMany(() => Municipality, (m) => m.state)
  municipalities: Municipality[];
}
