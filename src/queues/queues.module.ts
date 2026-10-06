import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DEFAULT_JOB_OPTIONS, DOCUMENTS_QUEUE, EMAIL_QUEUE } from 'src/documents/documents.const';
import { MAINTENANCE_QUEUE } from 'src/maintenance/maintenance.const';
import { QueuesService } from './queues.service';

/**
 * @summary Módulo de gestión de colas BullMQ.
 * @description
 * Este módulo configura y registra las colas de BullMQ utilizadas por la aplicación.
 * 
 * Se conecta automáticamente a Redis utilizando las variables definidas en el archivo `.env`,
 * y permite la inyección de las colas a través del decorador `@InjectQueue`.
 * 
 * También exporta el servicio `QueuesService`, el cual expone las colas
 * y los adaptadores necesarios para integrarlas con el panel Bull Board.
 */
@Module({
  imports: [
    // 🔹 Módulo de configuración global para acceder a variables de entorno
    ConfigModule,

    /**
     * @summary Configuración global de conexión a Redis para BullMQ.
     * @description
     * Se define de forma asíncrona para permitir la lectura de variables desde `ConfigService`.
     * Esta configuración se aplica a todas las colas registradas dentro de la aplicación.
     */
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST'),
          port: parseInt(config.get('REDIS_PORT') || '6379', 10),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    // `documents` renders PDFs and `email` sends mail; the email flow waits on a documents child job.
    // `maintenance` runs scheduled housekeeping such as the access-log and error-log purges.
    BullModule.registerQueue(
      { name: DOCUMENTS_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: EMAIL_QUEUE, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: MAINTENANCE_QUEUE },
    ),
    BullModule.registerFlowProducer({ name: EMAIL_QUEUE }),
  ],

  // 🔹 Proveedor principal con lógica de acceso a las colas
  providers: [QueuesService],

  // 🔹 Exporta el servicio para ser usado por otros módulos (p. ej. BullBoard)
  exports: [QueuesService, BullModule],
})
export class QueuesModule {}
