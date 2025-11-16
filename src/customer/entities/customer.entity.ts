import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { State } from '../../parameters/entities/state.entity';
import { Municipality } from '../../parameters/entities/municipality.entity';
import { Parish } from '../../parameters/entities/parish.entity';
import { VideoPublicity } from '../../parameters/entities/video-publicy.entity';

/**
 * Cliente → Customer
 */
@Entity({ schema: 'parametro', name: 'cliente' })
export class Customer {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'telefono', type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ name: 'direccion', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'estado_id', type: 'bigint', nullable: true })
  stateId: number | null;

  @Column({ name: 'municipio_id', type: 'bigint', nullable: true })
  municipalityId: number | null;

  @Column({ name: 'parroquia_id', type: 'bigint', nullable: true })
  parishId: number | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'empresa_id', type: 'bigint' })
  companyId: number;

  @Column({ name: 'letra', type: 'varchar', length: 255 })
  letter: string;

  @Column({ name: 'documento', type: 'bigint', nullable: true })
  document: number | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // 🔗 Relationships
  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  company: Company;

  @ManyToOne(() => State)
  @JoinColumn({ name: 'estado_id' })
  state: State;

  @ManyToOne(() => Municipality)
  @JoinColumn({ name: 'municipio_id' })
  municipality: Municipality;

  @ManyToOne(() => Parish)
  @JoinColumn({ name: 'parroquia_id' })
  parish: Parish;

  @OneToMany(() => VideoPublicity, (video) => video.customer)
  videos: VideoPublicity[];
}
