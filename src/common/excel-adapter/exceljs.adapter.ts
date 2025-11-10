import { Alignment, Borders, Fill, Font, Workbook } from 'exceljs';

/**
 * Define el estilo de las celdas del encabezado de una hoja Excel.
 */
export interface ExcelHeaderStyle {
  font?: Partial<Font>;
  alignment?: Partial<Alignment>;
  border?: Partial<Borders>;
  fill?: Fill;
  numFmt?: string;
}

/**
 * Especificación de una hoja Excel.
 * Contiene el nombre, encabezados, filas y configuración de estilos.
 */
export interface ExcelSheetSpec {
  name: string;
  titles?: string[];
  headers: Array<{
    key: string;
    title: string;
    width?: number;
    style?: ExcelHeaderStyle;
  }>;
  rows: any[];
}

/**
 * Clase abstracta base para generar archivos Excel.
 * Define la estructura que deben seguir los adaptadores concretos.
 */
export abstract class ExcelAdapter {
  abstract createWorkbook(
    sheets: ExcelSheetSpec[],
    options?: { fileName?: string },
  ): Promise<Buffer>;
}

/**
 * Implementación de ExcelAdapter usando la librería ExcelJS.
 * Permite crear workbooks con múltiples hojas, estilos y datos.
 */
export class ExcelJsAdapter extends ExcelAdapter {
  /**
   * Crea un workbook en memoria y retorna su contenido como Buffer.
   */
  async createWorkbook(
    sheets: ExcelSheetSpec[],
    _options?: { fileName?: string },
  ): Promise<Buffer> {
    const wb = new Workbook();
    wb.creator = 'Backend';
    wb.created = new Date();

    // Procesar cada hoja definida
    for (const sheetSpec of sheets) {
      const ws = wb.addWorksheet(sheetSpec.name || 'Sheet');

      // Configurar columnas
      ws.columns = sheetSpec.headers.map((h) => ({
        key: h.key,
        header: h.title,
        width: h.width || 18,
      }));

      // Encabezados con estilo
      sheetSpec.headers.forEach((h, idx) => {
        const cell = ws.getRow(1).getCell(idx + 1);
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
          ...(h.style?.font || {}),
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          ...(h.style?.alignment || {}),
        };
        cell.fill = h.style?.fill || {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E78' },
        };
        cell.border = h.style?.border || {
          top: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
          bottom: { style: 'thin' },
        };
        if (h.style?.numFmt) cell.numFmt = h.style.numFmt;
      });

      // Agregar filas de datos
      sheetSpec.rows.forEach((rowData) => {
        const mapped = sheetSpec.headers.reduce(
          (acc, h) => {
            acc[h.key] = rowData[h.key];
            return acc;
          },
          {} as Record<string, any>,
        );

        const row = ws.addRow(mapped);
        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'left',
            wrapText: true,
          };
          cell.border = {
            top: { style: 'hair' },
            left: { style: 'hair' },
            right: { style: 'hair' },
            bottom: { style: 'hair' },
          };
        });
      });

      // Aplicar autofiltro y altura de encabezado
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheetSpec.headers.length },
      };
      ws.getRow(1).height = 22;
    }

    // Convertir workbook a Buffer (ExcelJS devuelve ArrayBuffer)
    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
