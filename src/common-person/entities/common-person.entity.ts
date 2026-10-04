import { IdentityDocument } from 'src/parameters/entities/identity-document.entity';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CommonPersonImage } from './common-person-image.entity';
import { User } from '../../user/entities/user.entity';

// Si algún día mapeas parametro.documento_identidad:
// import { IdentityDocument } from 'src/identity-document/entities/identity-document.entity';

@Entity({ schema: 'public', name: 'persona_comun' })
// One active person per document; the letter is part of the document (M-18).
@Index('UQ_persona_comun_documento_activo', ['letter', 'documentNumber'], {
  unique: true,
  where: '"documento" IS NOT NULL AND "deleted_at" IS NULL',
})
@Check('CHK_persona_comun_sexo', `"sexo" IN ('F', 'M')`)
export class CommonPerson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'telefono', type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

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

  @Column({ name: 'photo_url', nullable: true, type: 'varchar', length: 500 })
  photoUrl: string | null;

  /** Needed to compute the age in a screening system (MJ-23). */
  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  birthDate: string | null;

  /** Biological sex, F or M (MJ-23); the empty `parametro.genero` catalog is not used. */
  @Column({ name: 'sexo', type: 'varchar', length: 1, nullable: true })
  sex: 'F' | 'M' | null;

  // RELATIONS

  // Inverse side: users.common_person_id is the only FK (M-23); a second one could diverge.
  @OneToOne(() => User, (user) => user.commonPerson)
  user?: User;

  @ManyToOne(() => IdentityDocument, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'letra', referencedColumnName: 'letter' })
  identityDocument: IdentityDocument;

  @OneToMany(() => CommonPersonImage, (img) => img.commonPerson)
  images: CommonPersonImage[];
}
