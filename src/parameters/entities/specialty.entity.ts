import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Department } from 'src/departments/entities/department.entity';

/**
 * Entidad Specialty (Especialidad médica)
 * Schema: parametro
 * Tabla: specialties
 *
 * Representa las especialidades médicas disponibles en el sistema
 * (Cardiología, Pediatría, Traumatología, etc.)
 */
@Entity({ schema: 'parametro', name: 'specialties' })
@Index('UQ_specialties_code_active', ['code'], { unique: true, where: '"deleted_at" IS NULL' })
// Expression index lower(name), created by migration; synchronize: false keeps generate from dropping it (M-19).
@Index('UQ_specialties_name_lower_active', { synchronize: false })
export class Specialty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  code: string | null; // Código de especialidad (ej: CARD, PED, TRAUM)

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // Relación con departamentos (M:N)
  @ManyToMany(() => Department, (dept) => dept.specialties)
  departments: Department[];
}
