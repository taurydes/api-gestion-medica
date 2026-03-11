import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { PermissionMenu } from './permission-menu.entity';

@Entity({ schema: 'seguridad', name: 'permisos' })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'nombre_mostrar', type: 'varchar', length: 255 })
  displayName: string;

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

  @Column({ name: 'orden', type: 'int', nullable: true })
  order: number | null;

  @Column({ name: 'requerido', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({
    name: 'tipo_control',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  controlType: string | null;

  // RELATIONS
  @OneToMany(() => PermissionMenu, (pm) => pm.permission)
  permissionMenus: PermissionMenu[];
}
