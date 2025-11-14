import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

/**
 * Disponibilidad → Availability
 */
@Entity({ schema: 'parametro', name: 'disponibilidad' })
export class Availability {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'descripcion', type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
