import { Role } from 'src/role/entities/role.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity({ schema: 'selfManagement', name: 'Users' })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'timestamp', nullable: true })
  email_verifiedAt: Date | null;

  @Column({ type: 'varchar', length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  remember_token: string | null;

  @Column({ type: 'boolean', default: false })
  activated: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  activation_code: string | null;

  @Column({ type: 'timestamp', nullable: true })
  activatedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin: Date | null;

  @Column({ type: 'bigint' })
  document: number;

  @Column({ type: 'varchar', length: 30 })
  firstName: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  middleName: string | null;

  @Column({ type: 'varchar', length: 30 })
  lastName: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  secondLastName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  homePhone: string | null;

  @Column({ type: 'varchar', length: 20 })
  mobilePhone: string;

  @Column({ type: 'varchar', length: 255 })
  homeAddress: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  workAddress: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'boolean' })
  internalUser: boolean;

  @Column({ type: 'bigint', nullable: true })
  userId: number | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true })
  createdAt: Date | null;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'bigint' })
  roleId: number;

  @Column({ type: 'varchar', length: 1 })
  letter: string;

  @Column({ type: 'bigint', nullable: true })
  institutionId: number | null;

  @Column({ type: 'bigint', nullable: true })
  parishId: number | null;

  @Column({ type: 'boolean', default: false })
  temporaryPassword: boolean;

  @Column({ type: 'bigint', nullable: true })
  regionalAddressId: number | null;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'roleId' })
  role: Role;
}