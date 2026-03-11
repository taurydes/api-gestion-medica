import { PermissionMenu } from 'src/permission/entities/permission-menu.entity';
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';


@Entity({ schema: 'seguridad', name: 'menu' })
export class Menu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'slug', type: 'varchar', length: 150, nullable: true })
  slug: string | null;

  @Column({
    name: 'menu_id',
    type: 'uuid',
    nullable: true,
  })
  parentId: string | null;

  @Column({ name: 'url', type: 'varchar', length: 100, nullable: true })
  url: string | null;

  @Column({ name: 'icono', type: 'varchar', length: 50, nullable: true })
  icon: string | null;

  @Column({ name: 'orden', type: 'smallint', default: 0 })
  order: number;

  @Column({ name: 'es_titulo', type: 'boolean', default: false })
  isTitle: boolean;

  @Column({ name: 'status', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

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

  @Column({ name: 'can', type: 'varchar', length: 255, nullable: true })
  can: string | null;

  // RELATIONS

  @ManyToOne(() => Menu, (menu) => menu.submenu, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'menu_id' })
  parent: Menu;

  @OneToMany(() => Menu, (menu) => menu.submenu)
  submenu: Menu[];

  @OneToMany(() => PermissionMenu, (pm) => pm.menu)
  permissionMenus: PermissionMenu[];

}
