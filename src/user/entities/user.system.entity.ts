import { Entity, Index, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from 'src/role/entities/role.entity';

@Entity({ schema: 'seguridad', name: 'users' })
// Unique on lower(btrim(...)) (migration NormalizeUserIdentities); declared so migration:generate keeps them.
@Index('UQ_seguridad_users_name_normalized', { synchronize: false })
@Index('UQ_seguridad_users_email_normalized', { synchronize: false })
export class UserSecurity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    name: 'email_verified_at',
    type: 'timestamp',
    nullable: true,
    default: () => 'now()',
  })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({
    name: 'status',
    type: 'boolean',
    default: true,
  })
  status: boolean;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({
    name: 'first_login',
    type: 'boolean',
    default: false,
  })
  firstLogin: boolean;

  // RELACIÓN
  @ManyToOne(() => Role, { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' })
  @JoinColumn({ name: 'role_id' })
  role: Role;
}