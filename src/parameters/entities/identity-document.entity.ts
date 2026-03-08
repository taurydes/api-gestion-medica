import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { CommonPerson } from 'src/common-person/entities/common-person.entity';

@Entity({ schema: 'parametro', name: 'documento_identidad' })
export class IdentityDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'letra',
    type: 'varchar',
    length: 255,
    unique: true,
    nullable: true,
  })
  letter: string | null;

  @Column({ name: 'descripcion', type: 'varchar', length: 255 })
  description: string;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

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

  @OneToMany(() => CommonPerson, (person) => person.identityDocument)
  people: CommonPerson[];
}
