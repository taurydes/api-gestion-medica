import { Role } from 'src/role/entities/role.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CommonPerson } from './common-person.entity';
@Entity({ schema: 'seguridad', name: 'users' })
export class UserSecurity {
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

  @Column({ name: 'remember_token', type: 'varchar', length: 100, nullable: true })
  rememberToken: string | null;

  @Column({ type: 'boolean', nullable: true })
  activated: boolean | null;

  @Column({ name: 'activation_code', type: 'varchar', length: 255, nullable: true })
  activationCode: string | null;

  @Column({ name: 'activated_at', type: 'timestamp', nullable: true })
  activatedAt: Date | null;

  @Column({ name: 'last_login', type: 'timestamp', nullable: true })
  lastLogin: Date | null;

  @Column({
    name: 'telefono_local',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  localPhone: string | null;

  @Column({
    name: 'telefono_movil',
    type: 'varchar',
    length: 20,
  })
  personalPhone: string;

  @Column({
    name: 'direccion_habitacion',
    type: 'varchar',
    length: 255,
  })
  houseAddress: string;

  @Column({
    name: 'direccion_trabajo',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  workAddress: string | null;

  @Column({
    name: 'estatus',
    type: 'boolean',
    default: true,
  })
  status: boolean;

  @Column({
    name: 'user_id',
    type: 'bigint',
    nullable: true,
    default: () => '1',
  })
  userId: number | null;

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  createdAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'rol_id', type: 'bigint' })
  roleId: number;

  @Column({
    name: 'persona_comun_id',
    type: 'bigint',
    nullable: true,
  })
  commonPersonId: number | null;

  @Column({
    name: 'fecha_nacimiento',
    type: 'date',
    nullable: true,
  })
  birthDate: Date | null;

  @Column({
    name: 'first_login',
    type: 'boolean',
    default: false,
  })
  firstLogin: boolean;

  // RELACIONES

  @ManyToOne(() => Role, { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' })
  @JoinColumn({ name: 'rol_id' })
  role: Role;

  @ManyToOne(() => CommonPerson, { onDelete: 'NO ACTION', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'persona_comun_id' })
  commonPerson: CommonPerson;

  @ManyToOne(() => UserSecurity, { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' })
  @JoinColumn({ name: 'user_id' })
  createdBy: UserSecurity;
}
