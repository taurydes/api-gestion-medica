import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';

@Entity({ schema: 'parametro', name: 'kiosko' })
@Unique('kiosko_codigo_key', ['code'])
@Index('idx_kiosko_codigo', ['code'])
export class Kiosko {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'codigo', type: 'varchar', length: 255 })
  code: string; // antes: codigo

  @Column({ name: 'nombre', type: 'varchar', length: 255, nullable: true })
  name: string | null; // antes: nombre

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

  @Column({
    name: 'uid',
    type: 'uuid',
    nullable: true,
    default: () => 'parametro.uuid_generate_v4()',
  })
  uid: string | null;
}