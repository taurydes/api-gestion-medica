import 'dotenv/config';
import { DataSource } from 'typeorm';
import configFactory from '../configuration/configuration';

const { database } = configFactory();

/** DataSource used only by the TypeORM CLI (migration:generate/run/revert); the app keeps its own connection. */
export default new DataSource({
  type: 'postgres',
  host: database.host,
  port: database.port,
  username: database.user,
  password: database.pass,
  database: database.name,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
});
