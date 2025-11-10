import PDFDocument = require('pdfkit');

/**
 * Clase abstracta: PdfAdapter
 *
 * Define la interfaz base para generar documentos PDF.
 * Las implementaciones concretas (como PdfKitAdapter)
 * deben devolver un archivo en formato Buffer.
 */
export abstract class PdfAdapter {
  abstract createPdf(data: any, options?: any): Promise<Buffer>;
}

/**
 * Implementación: PdfKitAdapter
 *
 * Utiliza la librería PDFKit para crear documentos PDF dinámicos.
 * Permite generar encabezados, contenido tabular, resúmenes
 * y pies de página basados en los datos proporcionados.
 */
export class PdfKitAdapter extends PdfAdapter {
  /**
   * Genera un PDF y devuelve su contenido como Buffer.
   * @param data Estructura de datos para construir el documento.
   * @param options Configuración opcional del PDF (márgenes, tamaño, fuentes, etc.).
   */
  async createPdf(data: any, options?: any): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument(options);
      const buffers: Buffer[] = [];

      // Captura los datos binarios generados por PDFKit
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Encabezado
      doc.font('Helvetica-Bold')
        .fontSize(13)
        .text(data.title || '', { align: 'center' });
      doc.moveDown();

      // Información general (usuario, cuenta, etc.)
      if (data.userInfo) {
        doc.font('Helvetica')
          .fontSize(10)
          .text(data.userInfo, { align: 'left' });
        doc.moveDown();
      }

      // Tabla de movimientos
      if (Array.isArray(data.movimientos)) {
        doc.font('Helvetica-Bold')
          .fontSize(10)
          .text('Detalle de Movimientos');
        doc.moveDown();

        doc.font('Helvetica-Bold')
          .fontSize(8)
          .text('Fecha | Referencia | Código | Descripción | Débito | Crédito | Saldo');
        doc.moveDown();

        doc.font('Helvetica').fontSize(8);
        data.movimientos.forEach((row: any) => {
          doc.text(
            `${row.fecha} | ${row.referencia} | ${row.codigo} | ${row.descripcion} | ${row.debito} | ${row.credito} | ${row.saldo}`,
          );
        });
        doc.moveDown();
      }

      // Sección de resumen
      if (data.resumen) {
        doc.font('Helvetica-Bold').fontSize(10).text('Resumen');
        doc.font('Helvetica').fontSize(9);
        doc.text(
          `Total Débitos: ${data.resumen.debitos} (${data.resumen.debitos_ind})`,
        );
        doc.text(
          `Total Créditos: ${data.resumen.creditos} (${data.resumen.creditos_ind})`,
        );
      }

      // Pie de página
      if (data.footer) {
        doc.moveDown(2);
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('gray')
          .text(data.footer, { align: 'center' });
      }

      doc.end();
    });
  }
}
