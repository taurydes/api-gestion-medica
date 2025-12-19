import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Role } from 'src/role/entities/role.entity';
import { CommonPerson } from './common-person.entity';

@Entity({ schema: 'selfManagement', name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
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

  @Column({ name: 'role_id', type: 'bigint' })
  roleId: number;

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

  @OneToOne(() => CommonPerson, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'common_person_id' })
  commonPerson: CommonPerson;
}