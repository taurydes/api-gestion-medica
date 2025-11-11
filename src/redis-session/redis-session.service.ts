import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';

/**
 * @summary Servicio para manejar sesiones únicas de usuario en Redis.
 * @description
 * Este servicio gestiona la persistencia y validación de sesiones
 * en Redis, garantizando que cada usuario solo tenga una sesión activa.
 *
 * Cuando un usuario inicia sesión, si ya existe una sesión previa,
 * esta se elimina automáticamente para impedir multi-sesiones.
 */
@Injectable()
export class RedisSessionService {
  private readonly logger = new Logger(RedisSessionService.name);

  constructor(
    @Inject('REDIS_SESSION_CLIENT')
    private readonly redisClient: RedisClientType,
  ) {}

  /**
   * @summary Crea o reemplaza la sesión activa de un usuario.
   * @description
   * Si el usuario ya tiene una sesión previa, se elimina antes de crear la nueva.
   * Así se garantiza que solo haya una sesión activa por usuario.
   *
   * @param userId ID del usuario (clave principal de sesión)
   * @param data Datos asociados (token, role, timestamps, etc.)
   * @param ttl Tiempo de vida en segundos (default: 1 hora)
   */
  async setSession(userId: string | number, data: Record<string, any>, ttl = 3600) {
    const key = `session:${userId}`;

    // Si ya existe una sesión previa, eliminarla antes
    const existing = await this.redisClient.exists(key);
    if (existing) {
      await this.redisClient.del(key);
      this.logger.debug(`Sesión previa eliminada para el usuario ${userId}`);
    }

    // Guardar la nueva sesión
    await this.redisClient.set(key, JSON.stringify(data), { EX: ttl });
    this.logger.debug(`Nueva sesión creada para el usuario ${userId}`);
  }

  /**
   * @summary Obtiene los datos de sesión del usuario.
   * @param userId ID del usuario
   * @returns Datos de la sesión o `null` si no existe
   */
  async getSession<T = any>(userId: string | number): Promise<T | null> {
    const key = `session:${userId}`;
    const session = await this.redisClient.get(key);
    return session ? JSON.parse(session) : null;
  }

  /**
   * @summary Elimina la sesión activa del usuario.
   * @param userId ID del usuario
   */
  async deleteSession(userId: string | number) {
    const key = `session:${userId}`;
    await this.redisClient.del(key);
    this.logger.debug(`Sesión eliminada para el usuario ${userId}`);
  }

  /**
   * @summary Verifica si el usuario tiene una sesión activa.
   * @param userId ID del usuario
   * @returns `true` si la sesión existe; `false` si expiró o fue cerrada.
   */
  async isValidSession(userId: string | number): Promise<boolean> {
    const key = `session:${userId}`;
    const exists = await this.redisClient.exists(key);
    return exists === 1;
  }

  /**
   * @summary Refresca la sesión del usuario.
   * @description
   * Renueva el tiempo de vida (TTL) de una sesión existente, útil para “mantener viva” la sesión activa.
   * @param userId ID del usuario
   * @param ttl Nuevo tiempo de vida (en segundos)
   */
  async refreshSession(userId: string | number, ttl = 3600) {
    const key = `session:${userId}`;
    const exists = await this.redisClient.exists(key);
    if (exists) {
      await this.redisClient.expire(key, ttl);
      this.logger.debug(`TTL de sesión renovado para el usuario ${userId}`);
    }
  }
}
