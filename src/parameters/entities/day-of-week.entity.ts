import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { ScheduleProgram } from './schedule-program.entity';

/**
 * Día de la semana → DayOfWeek
 */
@Entity({ schema: 'parametro', name: 'dia_semana' })
export class DayOfWeek {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'codigo', type: 'varchar', length: 10 })
  code: string;

  @Column({ name: 'nombre', type: 'varchar', length: 20 })
  name: string;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // 🔗 1 Día → Muchas programaciones
  @OneToMany(() => ScheduleProgram, (s) => s.day)
  schedules: ScheduleProgram[];
}
