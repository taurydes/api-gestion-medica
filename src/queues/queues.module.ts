import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
        },
      }),
    }),

    /**
     * @summary Registro de colas específicas utilizadas por la aplicación.
     * @description
     * Aquí se definen las colas BullMQ que serán instanciadas y disponibles para inyección.
     * Ejemplo: `emailQueue` para tareas de envío de correos electrónicos.
     */
    BullModule.registerQueue(
      { name: 'emailQueue' },
    ),
  ],

  // 🔹 Proveedor principal con lógica de acceso a las colas
  providers: [QueuesService],

  // 🔹 Exporta el servicio para ser usado por otros módulos (p. ej. BullBoard)
  exports: [QueuesService],
})
export class QueuesModule {}
