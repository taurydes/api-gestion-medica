import { Injectable } from '@nestjs/common';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { QueuesService } from '../queues.service';

/**
 * @summary Servicio encargado de inicializar y exponer el panel Bull Board.
 * @description
 * Este servicio configura el adaptador de Express y crea la instancia del panel
 * de administración Bull Board, el cual permite visualizar y gestionar las colas
 * de BullMQ en tiempo real.
 *
 * Se utiliza dentro del módulo principal (`AppModule`) para montar el panel
 * en la ruta `/admin/queues`.
 */
@Injectable()
export class BullBoardService {
  /**
   * @summary Adaptador de Express utilizado por Bull Board.
   * @description
   * `ExpressAdapter` es el middleware que conecta Bull Board con NestJS
   * (vía Express), permitiendo exponer su UI en una ruta específica.
   * 
   * En este caso, se configura para responder bajo `/admin/queues`.
   */
  public readonly serverAdapter = new ExpressAdapter();

  /**
   * @summary Inicializa Bull Board con las colas registradas.
   * @description
   * Al construirse este servicio:
   * - Se establece el prefijo base `/admin/queues` para la interfaz.
   * - Se obtiene la lista de colas activas desde `QueuesService`.
   * - Se crea la instancia del panel con `createBullBoard()`.
   *
   * Esto permite que Bull Board muestre métricas y tareas en tiempo real
   * de todas las colas definidas en `queues.module.ts`.
   */
  constructor(private readonly queuesService: QueuesService) {
    this.serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: this.queuesService.getBullAdapters(),
      serverAdapter: this.serverAdapter,
    });
  }
}
