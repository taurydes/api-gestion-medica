import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpAdapter } from './http.adapter';

export class AxiosAdapter extends HttpAdapter {
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axios.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axios.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await axios.put<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await axios.delete<T>(url, config);
    return response.data;
  }
}
