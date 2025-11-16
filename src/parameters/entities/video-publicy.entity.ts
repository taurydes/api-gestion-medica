import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Customer } from '../../customer/entities/customer.entity'; // parametro.cliente
import { Company } from '../../company/entities/company.entity';   // parametro.empresa

/**
 * English name: VideoPublicity
 * Spanish table: parametro.video_publicidad
 */
@Entity({ schema: 'parametro', name: 'video_publicidad' })
@Check('video_duracion_maxima', 'duration <= 30')
export class VideoPublicity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  /** nombre */
  @Column({ name: 'nombre', type: 'varchar', length: 255 })
  name: string;

  /** descripcion */
  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description: string | null;

  /** archivo_ruta */
  @Column({ name: 'archivo_ruta', type: 'varchar', length: 500 })
  filePath: string;

  /** duracion (debe ser <= 30) */
  @Column({ name: 'duracion', type: 'int' })
  duration: number;

  /** tamano */
  @Column({ name: 'tamano', type: 'int', nullable: true })
  size: number | null;

  /** estatus */
  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  /** FK: cliente_id → parametro.cliente */
  @Column({ name: 'cliente_id', type: 'bigint' })
  customerId: number;

  @ManyToOne(() => Customer, (customer) => customer.videos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cliente_id' })
  customer: Customer;

  /** FK: empresa_id → parametro.empresa */
  @Column({ name: 'empresa_id', type: 'bigint' })
  companyId: number;

  @ManyToOne(() => Company, (company) => company.videos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'empresa_id' })
  company: Company;

  /** created_at */
  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'now()',
    nullable: true,
  })
  createdAt: Date;

  /** updated_at */
  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  /** deleted_at */
  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
