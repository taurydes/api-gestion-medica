import { IdentityDocument } from 'src/parameters/entities/identity-document.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

// Si algún día mapeas parametro.documento_identidad:
// import { IdentityDocument } from 'src/identity-document/entities/identity-document.entity';

@Entity({ schema: 'public', name: 'persona_comun' })
export class CommonPerson {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'letra', type: 'varchar', length: 1, nullable: true })
  letter: string | null;

  @Column({ name: 'documento', type: 'varchar', length: 30, nullable: true })
  documentNumber: string | null;

  @Column({ name: 'primernombre', type: 'varchar', length: 30 })
  firstName: string;

  @Column({
    name: 'segundonombre',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  middleName: string | null;

  @Column({ name: 'primerapellido', type: 'varchar', length: 30 })
  lastName: string;

  @Column({
    name: 'segundoapellido',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  secondLastName: string | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: number;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    nullable: true,
    default: () => 'now()',
  })
  createdAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // RELATIONS

  @OneToOne(() => User, (user) => user.commonPerson)
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => IdentityDocument, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'letra', referencedColumnName: 'letter' })
  identityDocument: IdentityDocument;
}
