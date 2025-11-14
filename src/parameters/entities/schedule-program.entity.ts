import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DayOfWeek } from './day-of-week.entity';

/**
 * Programación de horario → ScheduleProgram
 */
@Entity({ schema: 'parametro', name: 'programacion_horario' })
export class ScheduleProgram {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'dia_id', type: 'int2' })
  dayId: number;

  @Column({ name: 'hora_inicio', type: 'time' })
  startTime: string;

  @Column({ name: 'hora_fin', type: 'time' })
  endTime: string;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  // 🔗 Many → One
  @ManyToOne(() => DayOfWeek, (d) => d.schedules, {
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'dia_id' })
  day: DayOfWeek;
}
