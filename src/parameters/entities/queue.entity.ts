import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

/**
 * Cola → Queue
 * Representa una cola de atención o procesos internos.
 */
@Entity({ schema: 'parametro', name: 'cola' })
export class Queue {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'empresa_id', type: 'bigint', nullable: true })
  companyId: number | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
