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
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'parroquia_id', type: 'uuid', nullable: true })
  parishId: string;

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

  @Column({ name: 'image_url', nullable: true, type: 'varchar', length: 500 })
  imageUrl: string | null;

  // Infrastructure fields
  @Column({ name: 'num_beds', type: 'int', default: 0 })
  numBeds: number;

  @Column({ name: 'num_operating_rooms', type: 'int', default: 0 })
  numOperatingRooms: number;

  @Column({ name: 'has_emergency', type: 'boolean', default: false })
  hasEmergency: boolean;

  @Column({ name: 'has_hospitalization', type: 'boolean', default: false })
  hasHospitalization: boolean;

  @Column({ name: 'has_intensive_care', type: 'boolean', default: false })
  hasIntensiveCare: boolean;

  @Column({ name: 'has_parking', type: 'boolean', default: false })
  hasParking: boolean;

  @Column({ name: 'has_pharmacy', type: 'boolean', default: false })
  hasPharmacy: boolean;

  @Column({ name: 'has_laboratory', type: 'boolean', default: false })
  hasLaboratory: boolean;

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
