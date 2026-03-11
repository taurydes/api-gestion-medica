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

@Entity({ schema: 'seguridad', name: 'permisos_menus' })
export class PermissionMenu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'permiso_id', type: 'uuid' })
  permissionId: string;

  @Column({ name: 'menu_id', type: 'uuid' })
  menuId: string;

  @Column({ name: 'rol_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

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

  @Column({ name: 'tamanio_campo', type: 'int', nullable: true })
  fieldSize: number | null;

  // RELATIONS

  @ManyToOne(() => Permission, (permission) => permission.permissionMenus, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'permiso_id' })
  permission: Permission;

  @ManyToOne(() => Menu, (menu) => menu.permissionMenus, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'menu_id' })
  menu: Menu;

  @ManyToOne(() => Role, (role) => role.permissionMenus, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'rol_id' })
  role: Role;
}
