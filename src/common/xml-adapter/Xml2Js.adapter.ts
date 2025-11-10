import * as xml2js from 'xml2js';

/**
 * Adaptador para convertir XML a objeto usando xml2js
 */
export class Xml2JsAdapter {
  /**
   * Convierte un string XML a un objeto JavaScript
   * @param xmlString XML en formato string
   * @returns Objeto JavaScript
   */
  async parse<T = any>(xmlString: string): Promise<T> {
    return await xml2js.parseStringPromise(xmlString, { explicitArray: false });
  }
}