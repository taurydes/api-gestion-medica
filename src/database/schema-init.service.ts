import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DatabaseConnectionName } from './DatabaseConnectionName';

/**
 * Crea los esquemas faltantes en PostgreSQL al arrancar.
 * El esquema de tablas lo gestionan las migraciones (`npm run migration:run`), no `synchronize()`.
 */
@Injectable()
export class SchemaInitService implements OnApplicationBootstrap {
  constructor(
    @InjectDataSource(DatabaseConnectionName.DB_MAIN)
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    const schemas = ['seguridad', 'parametro','selfManagement','public','auditoria'];

    for (const schema of schemas) {
      await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }
  }
}
