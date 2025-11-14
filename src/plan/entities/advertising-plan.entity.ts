import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from 'typeorm';

/**
 * Plan de Publicidad → AdvertisingPlan
 * Representa un paquete de publicidad.
 */
@Entity({ schema: 'parametro', name: 'plan_publicidad' })
@Unique(['code'])
export class AdvertisingPlan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'codigo', type: 'varchar', length: 255 })
  code: string;

  @Column({ name: 'nombre', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'duracion_total', type: 'bigint', nullable: true })
  totalDuration: number | null;

  @Column({ name: 'precio', type: 'numeric', precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'moneda_id', type: 'bigint', nullable: true })
  currencyId: number | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
