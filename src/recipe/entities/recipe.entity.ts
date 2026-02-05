import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { Patient } from 'src/patient/entities/patient.entity';
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
import { RecipeItem } from './recipe-item.entity';

/**
 * Entidad Recipe (Receta médica)
 * Schema: public
 * Tabla: recipes
 *
 * Representa una receta médica emitida por un doctor a un paciente
 * durante una consulta médica
 */
@Entity({ schema: 'public', name: 'recipes' })
export class Recipe {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  // ========== RELACIONES ==========

  @Column({ name: 'medical_history_id', type: 'bigint' })
  medicalHistoryId: number;

  @ManyToOne(() => MedicalHistory, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'medical_history_id' })
  medicalHistory: MedicalHistory;

  @Column({ name: 'patient_id', type: 'bigint' })
  patientId: number;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({ name: 'doctor_id', type: 'bigint' })
  doctorId: number;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Doctor;

  // ========== DATOS DE LA RECETA ==========

  @Column({ name: 'recipe_number', type: 'varchar', length: 50, unique: true })
  recipeNumber: string; // Número único de receta (ej: REC-2026-00001)

  @Column({ name: 'issue_date', type: 'timestamp' })
  issueDate: Date; // Fecha de emisión de la receta

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: Date | null; // Fecha de vencimiento de la receta

  @Column({ name: 'diagnosis', type: 'text', nullable: true })
  diagnosis: string | null; // Diagnóstico asociado a la receta

  @Column({ name: 'general_instructions', type: 'text', nullable: true })
  generalInstructions: string | null; // Instrucciones generales para el paciente

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null; // Notas adicionales del médico

  // ========== ITEMS DE LA RECETA ==========

  @OneToMany(() => RecipeItem, (item) => item.recipe, { cascade: true })
  items: RecipeItem[];

  // ========== ESTADO ==========

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status: string; // 'active', 'dispensed', 'expired', 'cancelled'

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
}
