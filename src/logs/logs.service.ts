import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Repository } from 'typeorm';
import { PaginationLogDto } from './dto/pagination-log.dto';
import { ErrorLog } from './entities/error-log.entity';
import { LogCreationOptions } from './logs.const';

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(ErrorLog, DatabaseConnectionName.DB_MAIN)
    private readonly errorLogRepository: Repository<ErrorLog>,
  ) {}

  /**
   * @summary Obtiene todos los logs con paginación.
   * @description Retorna registros de logs filtrados y paginados.
   * @param pagination DTO con page y limit.
   * @param user Información del usuario autenticado.
   * @returns Resultado paginado de logs.
   */
  async findAll(pagination: PaginationLogDto) {
    const {
      page = 1,
      limit = 10,
      statusCode,
      messageContains,
      route,
      exceptionType,
      httpMethod,
      userId,
      correlationId,
      host,
      appVersion,
      tags,
      handled,
      fromDate,
      toDate,
      orderBy = 'occurredAt',
      orderDir = 'DESC',
    } = pagination;

    const qb = this.errorLogRepository.createQueryBuilder('el');

    // Filtros dinámicos
    if (statusCode !== undefined) {
      qb.andWhere('el.statusCode = :statusCode', { statusCode });
    }
    if (messageContains) {
      qb.andWhere('el.message ILIKE :msg', { msg: `%${messageContains}%` });
    }
    if (route) {
      qb.andWhere('el.route ILIKE :route', { route: `%${route}%` });
    }
    if (exceptionType) {
      qb.andWhere('el.exceptionType = :exceptionType', { exceptionType });
    }
    if (httpMethod) {
      qb.andWhere('el.httpMethod = :httpMethod', { httpMethod });
    }
    if (userId !== undefined) {
      qb.andWhere('el.userId = :userId', { userId });
    }
    if (correlationId) {
      qb.andWhere('el.correlationId = :correlationId', { correlationId });
    }
    if (host) {
      qb.andWhere('el.host ILIKE :host', { host: `%${host}%` });
    }
    if (appVersion) {
      qb.andWhere('el.appVersion = :appVersion', { appVersion });
    }
    if (handled !== undefined) {
      qb.andWhere('el.handled = :handled', { handled });
    }
    if (tags && tags.length) {
      // Coincidencia si al menos uno de los tags está presente
      qb.andWhere(':tags && el.tags', { tags });
      // Alternativa exacta: qb.andWhere('el.tags @> :tags', { tags });
    }
    // Rango de fechas
    if (fromDate) {
      qb.andWhere('el.occurredAt >= :fromDate', {
        fromDate: new Date(fromDate),
      });
    }
    if (toDate) {
      // agregar final del día si viene sin hora
      const end = new Date(toDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        end.setHours(23, 59, 59, 999);
      }
      qb.andWhere('el.occurredAt <= :toDate', {
        toDate: end,
      });
    }

    // Orden seguro (lista blanca)
    const allowedOrder = ['occurredAt', 'statusCode', 'route', 'userId'];
    const orderField = allowedOrder.includes(orderBy) ? orderBy : 'occurredAt';
    qb.orderBy(`el.${orderField}`, orderDir === 'ASC' ? 'ASC' : 'DESC');

    // Paginación
    const skip = (Number(page) - 1) * Number(limit);
    qb.skip(skip).take(Number(limit));

    const [data, totalCount] = await qb.getManyAndCount();

    return {
      page: Number(page),
      limit: Number(limit),
      totalCount,
      totalPages: Math.ceil(totalCount / Number(limit)),
      orderBy: orderField,
      orderDir,
      filtersApplied: {
        statusCode,
        messageContains,
        route,
        exceptionType,
        httpMethod,
        userId,
        correlationId,
        host,
        appVersion,
        tags,
        handled,
        fromDate,
        toDate,
      },
      data,
    };
  }

  /**
   * @summary Obtiene un log por su ID.
   * @param id ID del log.
   * @returns Log correspondiente al ID.
   */
  findOne(id: number) {
    return this.errorLogRepository.findOne({ where: { id } });
  }

  /**
   * metodo para crear logs, es llamada desdde el interfector de excepciones
   * @param {LogCreationOptions} dto
   * @return {void}
   */
  async create(dto: LogCreationOptions): Promise<void> {
    try {
      if (dto.requestBody) {
        let requestBody = dto.requestBody;
        // Si es string, intenta parsear
        if (typeof requestBody === 'string') {
          try {
            requestBody = JSON.parse(requestBody);
          } catch {
            // Si no es JSON válido, lo dejamos como está
          }
        }
        // Si es objeto y tiene password, lo ocultamos
        if (
          typeof requestBody === 'object' &&
          requestBody !== null &&
          Object.prototype.hasOwnProperty.call(requestBody, 'password')
        ) {
          (requestBody as Record<string, any>)['password'] = '******';
        }
        // Guardamos como string
        dto.requestBody = requestBody;
      }
      const data = this.errorLogRepository.create(dto);
      await this.errorLogRepository.save(data);
    } catch (e) {
      throw new Error('Error al registrar log, ' + e.message);
    }
  }
}
