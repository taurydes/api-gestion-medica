import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from './DatabaseConnectionName';

/**
 * 🔹 getMainConnection()
 *
 * Configura y registra de forma asíncrona la conexión principal a la base de datos PostgreSQL
 * utilizando el módulo TypeORM de NestJS.
 *
 * Esta función se utiliza normalmente dentro del módulo raíz (`AppModule`) para establecer
 * una conexión reutilizable bajo el nombre definido en `DatabaseConnectionName.DB_MAIN`.
 *
 * ---
 *
 * ⚙️ Características principales:
 * - Carga la configuración de conexión desde las variables definidas en el entorno (`.env`).
 * - Usa `ConfigService` para obtener dinámicamente los valores del bloque `database` en el archivo de configuración.
 * - Define el tipo de base de datos como `postgres`.
 * - Habilita `autoLoadEntities` para que TypeORM registre automáticamente las entidades.
 * - Desactiva `synchronize` en entornos productivos (evita modificar el esquema automáticamente).
 *
 * ---
 *
 * 🧱 Estructura de conexión esperada en el archivo `.env`:
 * ```
 * DATABASE_HOST=localhost
 * DATABASE_PORT=5432
 * DATABASE_USER=postgres
 * DATABASE_PASS=1234
 * DATABASE_NAME=app_db
 * ```
 *
 * Y su respectiva carga en el módulo de configuración (`config/database.config.ts`):
 * ```ts
 * export default () => ({
 *   database: {
 *     host: process.env.DATABASE_HOST,
 *     port: parseInt(process.env.DATABASE_PORT, 10),
 *     user: process.env.DATABASE_USER,
 *     pass: process.env.DATABASE_PASS,
 *     name: process.env.DATABASE_NAME,
 *   },
 * });
 * ```
 *
 * ---
 *
 * 🧩 Ejemplo de uso en `AppModule`:
 * ```ts
 * @Module({
 *   imports: [
 *     ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
 *     getMainConnection(), // Conexión principal TypeORM
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ---
 *
 * 🧠 Nota:
 * Si tu aplicación maneja múltiples bases de datos, podés crear funciones similares
 * (`getLogsConnection`, `getAnalyticsConnection`, etc.) reutilizando este patrón.
 */
export function getMainConnection() {
  return TypeOrmModule.forRootAsync({
    // Nombre de la conexión (debe coincidir con el usado en los repositorios)
    name: DatabaseConnectionName.DB_MAIN,

    // Importa el módulo de configuración para acceder a las variables del entorno
    imports: [ConfigModule],
    inject: [ConfigService],

    /**
     * Fábrica de configuración que construye dinámicamente
     * los parámetros de conexión a partir del servicio de configuración.
     */
    useFactory: (configService: ConfigService) => {
      return {
        name: DatabaseConnectionName.DB_MAIN, // Identificador interno de la conexión
        type: 'postgres',                     // Motor de base de datos
        host: configService.get('database.host')!, // Host o IP del servidor
        port: configService.get('database.port')!, // Puerto (por defecto 5432)
        username: configService.get('database.user')!, // Usuario
        password: configService.get('database.pass')!, // Contraseña
        database: configService.get('database.name')!, // Nombre de la base
        autoLoadEntities: true,  // Carga automática de entidades (sin necesidad de importarlas manualmente)
        synchronize: false,      // ⚠️ No usar true en producción, ya que puede alterar el esquema
      };
    },
  });
}
