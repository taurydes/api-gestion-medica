import { Permission } from 'src/permission/entities/permission.entity';
import { Role } from 'src/role/entities/role.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'selfManagement', name: 'PermissionsRoles' })
export class PermissionRoles {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  permissionId: number;

  @Column({ type: 'bigint' })
  roleId: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Permission, (permission) => permission.permissionsRoles)
  @JoinColumn({ name: 'permissionId' })
  permission: Permission;

  @ManyToOne(() => Role, (role) => role.permissionsRoles)
  @JoinColumn({ name: 'roleId' })
  role: Role;
}
