import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  ManyToOne,
  JoinColumn,
  JoinTable,
  OneToOne,
} from 'typeorm';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import { Department } from 'src/departments/entities/department.entity';

/**
 * Entidad Doctor (Médico)
 * Schema: public
 * Tabla: doctors
 *
 * Representa a un médico del sistema con sus datos profesionales
 * y relación con persona común, centro médico y especialidad
 */
@Entity({ schema: 'public', name: 'doctors' })
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'common_person_id', type: 'uuid' })
  commonPersonId: string;

  @Column({
    name: 'license_number',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  licenseNumber: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // ========== RELACIONES ==========

  // Relación con CommonPerson (datos personales del doctor)
  @OneToOne(() => CommonPerson, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'common_person_id' })
  commonPerson: CommonPerson;

  // Relación con centro médico
  // Relación con centros médicos (M:N)
  @ManyToMany(() => MedicalCenter, (center) => center.doctors, {
    cascade: true,
  })
  @JoinTable({
    name: 'medical_centers_doctors',
    joinColumn: {
      name: 'doctor_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'medical_center_id',
      referencedColumnName: 'id',
    },
  })
  medicalCenters: MedicalCenter[];

  // Relación con especialidades (M:N)
  @ManyToMany(() => Specialty, { cascade: true })
  @JoinTable({
    name: 'doctors_specialties',
    joinColumn: {
      name: 'doctor_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'specialty_id',
      referencedColumnName: 'id',
    },
  })
  specialties: Specialty[];

  // Relación con departamentos (M:N)
  @ManyToMany(() => Department, (dept) => dept.doctors)
  @JoinTable({
    name: 'departments_doctors',
    joinColumn: {
      name: 'doctor_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'department_id',
      referencedColumnName: 'id',
    },
  })
  departments: Department[];
}
