import { MedicalCenter } from 'src/medical-center/entities/medical-center.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

/** Centers a non-doctor staff user works in (doctors keep medical_centers_doctors). */
@Entity({ name: 'users_medical_centers' })
@Index('UQ_users_medical_centers_active', ['userId', 'medicalCenterId'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class UserMedicalCenter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'medical_center_id', type: 'uuid' })
  medicalCenterId: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => MedicalCenter, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'medical_center_id' })
  medicalCenter: MedicalCenter;
}
