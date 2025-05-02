import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { PermissionRoles } from './PermissionRole.entity';

@Entity({ schema: 'selfManagement', name: 'Permissions' })
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  displayName: string;

  @Column({ type: 'int', nullable: true })
  order: number | null;

  @Column({ type: 'boolean', default: false })
  required: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  controlType: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @OneToMany(
    () => PermissionRoles,
    (permissionsRoles) => permissionsRoles.permission,
  )
  permissionsRoles: PermissionRoles[];
}
