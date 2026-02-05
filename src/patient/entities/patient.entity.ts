import { CommonPerson } from 'src/common-person/entities/common-person.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/* import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity'; // Si lo tienes
import { Appointment } from 'src/appointment/entities/appointment.entity'; // Si lo tienes */

@Entity({ schema: 'public', name: 'patients' })
export class Patient {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  // RELACIÓN CON PERSONA
  @Column({ name: 'common_person_id', type: 'bigint', unique: true })
  commonPersonId: number;

  @ManyToOne(() => CommonPerson, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'common_person_id' })
  commonPerson: CommonPerson;

  // DATOS ESPECÍFICOS DEL PACIENTE
  @Column({ name: 'patient_code', type: 'varchar', length: 20, unique: true })
  patientCode: string; // Ej: "PAC-2025-001"

  @Column({
    name: 'marital_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  maritalStatus: string; // Soltero, Casado, Viudo, etc.

  @Column({ name: 'occupation', type: 'varchar', length: 100, nullable: true })
  occupation: string;

  @Column({
    name: 'emergency_contact_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  emergencyContactName: string;

  @Column({
    name: 'emergency_contact_phone',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  emergencyContactPhone: string;

  @Column({
    name: 'emergency_contact_relationship',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  emergencyContactRelationship: string; // Padre, Hijo, Conyuge, etc.

  @Column({ name: 'blood_type', type: 'varchar', length: 5, nullable: true })
  bloodType: string; // A+, O-, etc.

  @Column({ name: 'allergies', type: 'text', nullable: true })
  allergies: string;

  @Column({ name: 'chronic_diseases', type: 'text', nullable: true })
  chronicDiseases: string; // Diabetes, Hipertensión, etc.

  @Column({ name: 'current_medications', type: 'text', nullable: true })
  currentMedications: string;

  @Column({
    name: 'insurance_company',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  insuranceCompany: string;

  @Column({
    name: 'insurance_policy_number',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  insurancePolicyNumber: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // RELACIONES CON OTROS MÓDULOS
  /*   @OneToMany(() => MedicalHistory, (history) => history.patient)
  medicalHistories: MedicalHistory[];

  @OneToMany(() => Appointment, (appointment) => appointment.patient)
  appointments: Appointment[]; */

  // AUDITORÍA
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy: number; // ID del usuario que creó el registro

  @Column({ name: 'updated_by', type: 'bigint', nullable: true })
  updatedBy: number; // ID del usuario que actualizó
}
