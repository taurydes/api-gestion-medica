import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 'login_failed' rows have no user; resourceId carries the credential typed (never the password). */
export type AccessLogAction = 'read' | 'write' | 'login_failed';

/** Insert-only trail of successful writes, clinical reads and failed logins (MJ-39); request bodies are never stored. */
@Entity({ name: 'access_log', schema: 'auditoria' })
@Index('idx_access_log_created_at', ['createdAt'])
@Index('idx_access_log_user', ['userId'])
@Index('idx_access_log_resource', ['resource', 'resourceId'])
export class AccessLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'http_method', type: 'varchar', length: 10 })
  method: string;

  /** Path without the query string (search terms may carry personal data). */
  @Column({ type: 'varchar', length: 500 })
  path: string;

  /** First path segment, e.g. medical-history, recipes, permissions. */
  @Column({ type: 'varchar', length: 60 })
  resource: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 64, nullable: true })
  resourceId: string | null;

  /** 'read' for clinical reads, 'write' for every successful POST/PUT/PATCH/DELETE. */
  @Column({ type: 'varchar', length: 20 })
  action: AccessLogAction;

  @Column({ name: 'status_code', type: 'int' })
  statusCode: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;
}
