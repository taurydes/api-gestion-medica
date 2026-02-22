import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Specialty } from 'src/parameters/entities/specialty.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entidad Department (Departamento médico)
 * Schema: parametro
 * Tabla: departments
 *
 * Representa un departamento dentro de un centro médico.
 * Un departamento agrupa varias especialidades médicas.
 */
@Entity({ schema: 'parametro', name: 'departments' })
export class Department {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'medical_center_id', type: 'bigint' })
  medicalCenterId: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ========== AUDITORÍA ==========

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: number | null;

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: number | null;

  // ========== RELACIONES ==========

  @ManyToOne(() => MedicalCenter, (center) => center.departments, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;

  @OneToMany(() => Specialty, (specialty) => specialty.department)
  specialties: Specialty[];
}
