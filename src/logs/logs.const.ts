export enum LogsEntities {
  UserLogs = 'UserLog',
  LogsApi = 'LogsApi',
  AdminLogs = 'AdminLogs',
  Negligible = 'Negligible', //despreciable no se guarda en logs
}

export interface CustomExceptionOptions {
  message: string;
  title?: string;
  code?: number;
  entityDestination: LogsEntities;
  data?: any;
  actionId: LogsType;
  statusCode: number;
}

export interface LogCreationOptions {
  occurredAt?: Date;
  exceptionType?: string;
  message?: string;
  stackTrace?: string;
  statusCode?: number;
  route?: string;
  httpMethod?: string;
  userId?: number;
  correlationId?: string;
  host?: string;
  appVersion?: string;
  headers?: any;
  requestQuery?: any;
  context?: any;
  tags?: string[];
  handled?: boolean;
  browserAgent?: string;
  requestBody?:string
}

export enum LogsType {
  error_de_servicio = 1, // aca es como lanzar el error 500
}

export const LogsTypeName: Record<number, string> = {
  1: 'Error de servicio',
};

export function getLogsTypeName(type: number): string {
  return LogsTypeName[type] || 'Desconocido';
}
