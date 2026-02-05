import { Recipe } from './recipe.entity';
import { Medication } from 'src/parameters/entities/medication.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Entidad RecipeItem (Ítem de receta médica)
 * Schema: public
 * Tabla: recipe_items
 *
 * Representa cada medicamento prescrito en una receta médica
 * con su dosis, frecuencia y duración
 */
@Entity({ schema: 'public', name: 'recipe_items' })
export class RecipeItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  // ========== RELACIONES ==========

  @Column({ name: 'recipe_id', type: 'bigint' })
  recipeId: number;

  @ManyToOne(() => Recipe, (recipe) => recipe.items, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'recipe_id' })
  recipe: Recipe;

  @Column({ name: 'medication_id', type: 'bigint', nullable: true })
  medicationId: number | null;

  @ManyToOne(() => Medication, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'medication_id' })
  medication: Medication | null;

  // ========== DATOS DEL MEDICAMENTO ==========

  @Column({ name: 'medication_name', type: 'varchar', length: 255 })
  medicationName: string; // Nombre del medicamento (incluso si no está en catálogo)

  @Column({ name: 'presentation', type: 'varchar', length: 100, nullable: true })
  presentation: string | null; // Presentación (tabletas, jarabe, inyección, etc.)

  @Column({ name: 'concentration', type: 'varchar', length: 50, nullable: true })
  concentration: string | null; // Concentración (ej: 500mg, 10ml, etc.)

  @Column({ name: 'quantity', type: 'int' })
  quantity: number; // Cantidad prescrita

  @Column({ name: 'unit', type: 'varchar', length: 20, nullable: true })
  unit: string | null; // Unidad (tabletas, frascos, ampollas, etc.)

  // ========== INSTRUCCIONES DE ADMINISTRACIÓN ==========

  @Column({ name: 'dosage', type: 'varchar', length: 100 })
  dosage: string; // Dosis (ej: "1 tableta", "10 gotas", "5ml")

  @Column({ name: 'frequency', type: 'varchar', length: 100 })
  frequency: string; // Frecuencia (ej: "cada 8 horas", "2 veces al día")

  @Column({ name: 'duration', type: 'varchar', length: 100, nullable: true })
  duration: string | null; // Duración del tratamiento (ej: "7 días", "hasta terminar")

  @Column({ name: 'route', type: 'varchar', length: 50, nullable: true })
  route: string | null; // Vía de administración (oral, tópica, intravenosa, etc.)

  @Column({ name: 'instructions', type: 'text', nullable: true })
  instructions: string | null; // Instrucciones específicas (ej: "tomar con alimentos")

  @Column({ name: 'order_number', type: 'int', default: 1 })
  orderNumber: number; // Orden de aparición en la receta
}
