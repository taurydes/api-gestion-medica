import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'error_log', schema: 'auditoria' })
export class ErrorLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'occurred_at' })
  occurredAt: Date;

  @Index()
  @Column({ name: 'exception_type', length: 200 })
  exceptionType: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ name: 'stack_trace', type: 'text', nullable: true })
  stackTrace: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number;

  @Index()
  @Column({ length: 300, nullable: true })
  route: string;

  @Column({ name: 'http_method', length: 10, nullable: true })
  httpMethod: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: number;

  @Column({ name: 'correlation_id', type: 'uuid', nullable: true })
  correlationId: string;

  @Column({ nullable: true, length: 150 })
  host: string;

  @Column({ name: 'app_version', length: 50, nullable: true })
  appVersion: string;

  @Column({ type: 'jsonb', nullable: true })
  headers: any;

  @Column({ name: 'request_query', type: 'jsonb', nullable: true })
  requestQuery: any;

  @Column({ name: 'request_body', type: 'jsonb', nullable: true })
  requestBody: any;

  @Column({ type: 'jsonb', nullable: true })
  context: any;

  @Column({ type: 'text', array: true, nullable: true })
  tags: string[];

  @Column({ default: true })
  handled: boolean;
}