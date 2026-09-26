import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { Role } from 'src/role/entities/role.entity';
import { CommonPerson } from '../../common-person/entities/common-person.entity';

@Entity({ schema: 'public', name: 'users' })
// Partial: a soft-deleted user must not block reusing its name or email (M-21).
@Index('UQ_users_name_active', ['name'], { unique: true, where: '"deleted_at" IS NULL' })
@Index('UQ_users_email_active', ['email'], { unique: true, where: '"deleted_at" IS NULL' })
export class User {
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
    default: true,
  })
  firstLogin: boolean;

  // RELACIÓN
  @ManyToOne(() => Role, { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @OneToOne(() => CommonPerson, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'common_person_id' })
  commonPerson: CommonPerson;
}
