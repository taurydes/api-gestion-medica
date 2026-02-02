import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DatabaseConnectionName } from './DatabaseConnectionName';

/**
 * Servicio de arranque para crear esquemas faltantes en PostgreSQL
 * y ejecutar la sincronización de TypeORM una vez creados.
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

    // Una vez creados los esquemas, sincronizamos las entidades
    await this.dataSource.synchronize();
  }
}
