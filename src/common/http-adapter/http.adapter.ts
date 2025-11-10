/**
 * Clase abstracta: HttpAdapter
 *
 * Define la interfaz base para los adaptadores HTTP.
 * Cada implementación concreta (por ejemplo, Axios, Fetch, etc.)
 * debe implementar los métodos CRUD principales: GET, POST, PUT y DELETE.
 */
export abstract class HttpAdapter {
  /** Ejecuta una petición HTTP GET. */
  abstract get<T = any>(url: string, config?: any): Promise<T>;

  /** Ejecuta una petición HTTP POST. */
  abstract post<T = any>(url: string, data?: any, config?: any): Promise<T>;

  /** Ejecuta una petición HTTP PUT. */
  abstract put<T = any>(url: string, data?: any, config?: any): Promise<T>;

  /** Ejecuta una petición HTTP DELETE. */
  abstract delete<T = any>(url: string, config?: any): Promise<T>;
}
