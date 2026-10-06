import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MAINTENANCE_QUEUE } from 'src/maintenance/maintenance.const';
import { DOCUMENTS_QUEUE, EMAIL_QUEUE } from 'src/documents/documents.const';

/**
 * @summary Servicio central para la gestión de colas BullMQ en el sistema.
 * @description
 * Este servicio encapsula la lógica para acceder y manipular las distintas colas
 * registradas en el módulo `QueuesModule`.  
 * 
 * Además, expone una interfaz común para que otros módulos (como el panel de Bull Board)
 * puedan obtener los adaptadores necesarios para visualizar el estado de las colas en tiempo real.
 */
@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue(DOCUMENTS_QUEUE) private documentsQueue: Queue,
    @InjectQueue(EMAIL_QUEUE) private emailQueue: Queue,
    @InjectQueue(MAINTENANCE_QUEUE) private maintenanceQueue: Queue,
  ) {}

  /**
   * @summary Retorna los adaptadores BullMQ para Bull Board.
   * @description
   * Convierte las colas registradas (BullMQ Queues) en adaptadores compatibles con la interfaz
   * de administración de Bull Board, permitiendo visualizar el estado, trabajos activos,
   * completados y fallidos.
   *
   * @returns {BullMQAdapter[]} Lista de adaptadores BullMQ.
   */
  getBullAdapters() {
    return [
      new BullMQAdapter(this.documentsQueue),
      new BullMQAdapter(this.emailQueue),
      new BullMQAdapter(this.maintenanceQueue),
    ];
  }
}
