import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'parametro', name: 'video_publicidad' })
export class VideoPublicity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ name: 'archivo_ruta', length: 500 })
  archivoRuta: string;

  @Column({ type: 'int' })
  duracion: number;

  @Column({ type: 'int', nullable: true })
  tamano: number;

  @Column({ name: 'estatus', type: 'boolean', default: true })
  estatus: boolean;

  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date;
}
