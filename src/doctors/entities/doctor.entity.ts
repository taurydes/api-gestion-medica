import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { CommonPerson } from 'src/user/entities/common-person.entity';

@Entity({ schema: 'seguridad', name: 'doctors' })
export class Doctor {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'common_person_id', type: 'bigint' })
  commonPersonId: number;

  @Column({ name: 'medical_center_id', type: 'bigint', nullable: true })
  medicalCenterId: number | null;

  @Column({ name: 'specialty', type: 'varchar', length: 255 })
  specialty: string;

  @Column({ name: 'license_number', type: 'varchar', length: 100, unique: true })
  licenseNumber: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // Relación con CommonPerson (datos personales del doctor)
  @OneToOne(() => CommonPerson, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'common_person_id' })
  commonPerson: CommonPerson;

  // Relación con centro médico
  @ManyToOne(() => MedicalCenter, (center) => center.doctors, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;
}
