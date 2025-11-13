import { PermissionMenu } from 'src/permission/entities/permission-menu.entity';
import { PermissionRole } from 'src/permission/entities/Permission-role.entity';
import { UserSecurity } from 'src/user/entities/user.system.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';


@Entity({ schema: 'seguridad', name: 'roles' })
export class Role {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'nombre', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

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

  @Column({ name: 'telpo', type: 'boolean', default: false })
  isTelpo: boolean;

  // RELATIONS

  @OneToMany(() => UserSecurity, (user) => user.role)
  users: UserSecurity[];

  @OneToMany(() => PermissionMenu, (pm) => pm.role)
  permissionMenus: PermissionMenu[];

  @OneToMany(() => PermissionRole, (pm) => pm.permission)
  permissionsRoles: PermissionRole[];
}
