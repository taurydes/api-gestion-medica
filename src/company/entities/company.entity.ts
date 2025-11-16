import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { State } from '../../parameters/entities/state.entity';
import { Municipality } from '../../parameters/entities/municipality.entity';
import { VideoPublicity } from '../../parameters/entities/video-publicy.entity';

/**
 * Empresa → Company
 */
@Entity({ schema: 'parametro', name: 'empresa' })
export class Company {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'codigo', type: 'varchar', length: 255, nullable: true })
  code: string | null;

  @Column({ name: 'rif', type: 'varchar', length: 255, nullable: true })
  rif: string | null;

  @Column({ name: 'estado_id', type: 'bigint', nullable: true })
  stateId: number | null;

  @Column({ name: 'municipio_id', type: 'bigint', nullable: true })
  municipalityId: number | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'numero_cuenta', type: 'varchar', length: 255, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'filial', type: 'boolean', default: false })
  isSubsidiary: boolean;

  @Column({ name: 'comision', type: 'boolean', default: false })
  hasCommission: boolean;

  @Column({
    name: 'numero_cuenta_comision',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  commissionAccountNumber: string | null;

  @Column({ name: 'nombre', type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // 🔗 Many Companies → 1 State
  @ManyToOne(() => State, { onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'estado_id' })
  state: State;

  // 🔗 Many Companies → 1 Municipality
  @ManyToOne(() => Municipality, { onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'municipio_id' })
  municipality: Municipality;

  @OneToMany(() => VideoPublicity, (video) => video.company)
  videos: VideoPublicity[];

}
