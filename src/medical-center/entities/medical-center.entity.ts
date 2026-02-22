import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Department } from 'src/departments/entities/department.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Parish } from 'src/parameters/entities/parish.entity';

@Entity({ schema: 'parametro', name: 'medical_centers' })
export class MedicalCenter {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'parroquia_id', type: 'bigint', nullable: true })
  parishId: number;

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

  // Relación con doctores (M:N)
  @ManyToMany(() => Doctor, (doctor) => doctor.medicalCenters)
  doctors: Doctor[];

  @ManyToOne(() => Parish, (parish) => parish.medicalCenters)
  @JoinColumn({ name: 'parroquia_id' })
  parish: Parish;

  // Relación con departamentos (1:N)
  @OneToMany(() => Department, (dept) => dept.medicalCenter)
  departments: Department[];
}
