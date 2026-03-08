import { Menu } from 'src/menu/entities/menu.entity';
import { Permission } from 'src/permission/entities/permission.entity';
import { Role } from 'src/role/entities/role.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'seguridad', name: 'permisos_roles' })
export class PermissionRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'permiso_id', type: 'uuid' })
  permissionId: string;

  @Column({ name: 'submenu_id', type: 'uuid' })
  submenuId: string;

  @Column({ name: 'rol_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'activo', type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'now()',
  })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // RELATIONS

  @ManyToOne(() => Permission, (permission) => permission.permissionRoles, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'permiso_id' })
  permission: Permission;

  
  @ManyToOne(() => Role, { onDelete: 'NO ACTION', onUpdate: 'NO ACTION' })
  @JoinColumn({ name: 'rol_id' })
  role: Role;

  @ManyToOne(() => Menu, (menu) => menu.permissionRoles, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'submenu_id' })
  submenu: Menu;
}
