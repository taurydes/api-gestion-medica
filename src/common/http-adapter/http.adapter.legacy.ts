import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import { HttpAdapter } from './http.adapter';

/**
 * Implementación: HttpLegacyAdapter
 *
 * Adaptador HTTP basado en Axios, diseñado para manejar
 * peticiones REST simples con soporte para HTTPS y configuración
 * flexible de cabeceras, timeouts y agentes.
 */
export class HttpLegacyAdapter extends HttpAdapter {
  /** Ejecuta una petición GET. */
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('GET', url, undefined, config);
  }

  /** Ejecuta una petición POST. */
  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>('POST', url, data, config);
  }

  /** Ejecuta una petición PUT. */
  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>('PUT', url, data, config);
  }

  /** Ejecuta una petición DELETE. */
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>('DELETE', url, undefined, config);
  }

  /**
   * Método interno para construir y ejecutar peticiones HTTP.
   * Configura cabeceras, agente HTTPS y control de errores.
   */
  private async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const axiosConfig: AxiosRequestConfig = {
        url,
        method,
        headers: config?.headers || { 'Content-Type': 'application/json' },
        timeout: config?.timeout ?? 6000,
        httpsAgent: new https.Agent({
          rejectUnauthorized:
            config?.httpsAgent?.options?.rejectUnauthorized ?? true,
        }),
        ...config,
      };

      if (body) {
        axiosConfig.data = body;
      }

      const response = await axios.request<T>(axiosConfig);
      return response.data;
    } catch (e: any) {
      throw new Error(e.message);
    }
  }
}
