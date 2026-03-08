import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { State } from './state.entity';
import { Parish } from './parish.entity';

/**
 * Municipio → Municipality
 * Representa un municipio dentro de un estado.
 */
@Entity({ schema: 'parametro', name: 'municipio' })
export class Municipality {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'estado_id', type: 'uuid' })
  stateId: string;

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

  // 🔗 Many Municipalities → 1 State
  @ManyToOne(() => State, (state) => state.municipalities, {
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'estado_id' })
  state: State;

  // 🔗 1 Municipality → Many Parishes
  @OneToMany(() => Parish, (p) => p.municipality)
  parishes: Parish[];
}
