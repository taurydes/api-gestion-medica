import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as dicomParser from 'dicom-parser';
import * as sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  assertFolderId,
  assertSafeFileName,
  resolveUploadPath,
} from './upload-path.util';

/**
 * @summary Representación de una imagen producida a partir de un archivo DICOM.
 * @description Cada frame del DICOM se convierte a JPEG en escala de grises
 *   y se guarda en disco; el cliente lo consume por URL (cacheable y mucho
 *   más pequeño que base64 inline).
 */
export interface DicomConvertedImage {
  index: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  url: string;
  /** Ruta relativa dentro de UPLOADS_PATH (útil para limpieza posterior). */
  relativePath: string;
}

interface ParsedDicom {
  dataSet: dicomParser.DataSet;
  rows: number;
  cols: number;
  bitsAllocated: number;
  bitsStored: number;
  numberOfFrames: number;
  pixelDataOffset: number;
  isSigned: boolean;
  isMonochrome1: boolean;
  windowCenter: number | null;
  windowWidth: number | null;
  rescaleSlope: number;
  rescaleIntercept: number;
}

export interface DicomConvertResult {
  sessionId: string;
  totalFrames: number;
  patientId?: string;
  studyDescription?: string;
  modality?: string;
  images: DicomConvertedImage[];
}

/** Preview conversions older than this are deleted (MJ-42); the sweep runs at start-up and every hour. */
export const DICOM_CONVERSION_TTL_MS = 24 * 60 * 60 * 1000;
const DICOM_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class DicomConverterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DicomConverterService.name);
  private readonly uploadsDir: string;
  private readonly publicUrl: string;
  private readonly tmpFolder = 'dicom-conversions';
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.uploadsDir =
      this.configService.get<string>('UPLOADS_PATH') || 'uploads';
    const host = this.configService.get<string>('URL_HOST') || 'localhost';
    const port = this.configService.get<string>('PORT') || '8008';
    const baseHost = host.startsWith('http') ? host : `http://${host}`;
    this.publicUrl = `${baseHost}:${port}`;
  }

  onModuleInit(): void {
    this.removeExpiredConversions();
    this.sweepTimer = setInterval(() => this.removeExpiredConversions(), DICOM_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Deletes conversion folders last written before `now - ttl`; returns how many were removed. */
  removeExpiredConversions(now = Date.now(), ttlMs = DICOM_CONVERSION_TTL_MS): number {
    const root = resolveUploadPath(this.uploadsDir, this.tmpFolder);
    if (!fs.existsSync(root)) return 0;
    let removed = 0;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      try {
        if (now - fs.statSync(dir).mtimeMs > ttlMs) {
          fs.rmSync(dir, { recursive: true, force: true });
          removed++;
        }
      } catch (error) {
        // A folder another request is still writing or already removed is left for the next sweep.
        this.logger.warn(`No se pudo limpiar ${entry.name}: ${(error as Error).message}`);
      }
    }
    if (removed) this.logger.log(`Conversiones DICOM vencidas eliminadas: ${removed}`);
    return removed;
  }
  /* ============================================================
   * 🧬 CONVERSIÓN DICOM → PNG (uno o varios frames)
   * ============================================================ */

  /**
   * @summary Convertir un archivo DICOM en una o varias imágenes PNG.
   * @description
   * - Parsea el archivo con `dicom-parser`.
   * - Soporta Implicit/Explicit VR Little Endian sin compresión
   *   (Transfer Syntax 1.2.840.10008.1.2, 1.2.840.10008.1.2.1).
   * - Extrae cada frame, aplica Window/Level (VOI LUT) si está disponible
   *   y produce un PNG de 8 bits en escala de grises.
   * - Para mamografía MONOCHROME1 se invierte el rango.
   */
  async convert(file: Express.Multer.File): Promise<DicomConvertResult> {
    if (!file) {
      throw new BadRequestException('Debe enviar un archivo DICOM.');
    }
    const parsed = this.parse(file.buffer);
    const { dataSet, rows, cols, numberOfFrames } = parsed;

    const images: DicomConvertedImage[] = [];

    // Carpeta de salida única por conversión: uploads/dicom-conversions/{sessionId}/
    const sessionId = randomUUID();
    const relativeDir = path
      .join(this.tmpFolder, sessionId)
      .replace(/\\/g, '/');
    const absoluteDir = path.join(
      process.cwd(),
      this.uploadsDir,
      relativeDir,
    );
    fs.mkdirSync(absoluteDir, { recursive: true });

    try {
      for (let frame = 0; frame < numberOfFrames; frame++) {
        // JPEG calidad 90, mozjpeg para mejor ratio sin perder velocidad.
        // Para imágenes monocromáticas no usa chroma subsampling.
        const fileName = `frame-${frame + 1}.jpg`;
        const absoluteFile = path.join(absoluteDir, fileName);
        await this.frameToJpeg(parsed, file.buffer, frame).toFile(absoluteFile);

        const relativeFile = `${relativeDir}/${fileName}`;
        images.push({
          index: frame,
          width: cols,
          height: rows,
          mimeType: 'image/jpeg',
          relativePath: relativeFile,
          url: `${this.publicUrl}/files/${this.tmpFolder}/${sessionId}/${fileName}`,
        });
      }
    } catch (err) {
      // Limpieza best-effort si falla a mitad de camino
      try {
        fs.rmSync(absoluteDir, { recursive: true, force: true });
      } catch {}
      throw new InternalServerErrorException(
        'Error al convertir el archivo DICOM a imagen.',
      );
    }

    return {
      sessionId,
      totalFrames: numberOfFrames,
      patientId: dataSet.string('x00100020')?.trim(),
      studyDescription: dataSet.string('x00081030')?.trim(),
      modality: dataSet.string('x00080060')?.trim(),
      images,
    };
  }

  /** Convierte un frame del DICOM a JPEG en memoria (lo que se envía al detector). */
  async renderFrameJpeg(buffer: Buffer, frame = 0): Promise<Buffer> {
    const parsed = this.parse(buffer);
    if (frame >= parsed.numberOfFrames) {
      throw new BadRequestException('El archivo DICOM no contiene el frame solicitado.');
    }
    try {
      return await this.frameToJpeg(parsed, buffer, frame).toBuffer();
    } catch {
      throw new InternalServerErrorException(
        'Error al convertir el archivo DICOM a imagen.',
      );
    }
  }

  /** True si el buffer lleva la firma `DICM` del preámbulo DICOM Part 10. */
  static isDicom(buffer: Buffer): boolean {
    return (
      buffer.length > 132 && buffer.toString('ascii', 128, 132) === 'DICM'
    );
  }

  private parse(buffer: Buffer): ParsedDicom {
    let dataSet: dicomParser.DataSet;
    try {
      dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
    } catch (err) {
      throw new BadRequestException(
        'El archivo no es un DICOM válido o está corrupto.',
      );
    }

    const transferSyntaxUid = dataSet.string('x00020010') || '';
    if (!this.isSupportedTransferSyntax(transferSyntaxUid)) {
      throw new BadRequestException(
        `Transfer Syntax no soportada: ${transferSyntaxUid}. ` +
          'Solo se aceptan DICOM sin compresión (Implicit/Explicit VR Little Endian).',
      );
    }

    const rows = dataSet.uint16('x00280010');
    const cols = dataSet.uint16('x00280011');
    const bitsAllocated = dataSet.uint16('x00280100');
    const pixelRepresentation = dataSet.uint16('x00280103') ?? 0;
    const samplesPerPixel = dataSet.uint16('x00280002') ?? 1;
    const photometric =
      dataSet.string('x00280004')?.trim() || 'MONOCHROME2';
    const numberOfFrames = dataSet.intString('x00280008') ?? 1;

    if (!rows || !cols || !bitsAllocated) {
      throw new BadRequestException(
        'Archivo DICOM incompleto: faltan dimensiones o profundidad de píxel.',
      );
    }

    const bitsStored = dataSet.uint16('x00280101') ?? bitsAllocated;

    if (samplesPerPixel !== 1) {
      throw new BadRequestException(
        'Solo se soportan imágenes DICOM monocromáticas (mamografía).',
      );
    }

    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      throw new BadRequestException(
        'El archivo DICOM no contiene datos de píxel (PixelData).',
      );
    }

    return {
      dataSet,
      rows,
      cols,
      bitsAllocated,
      bitsStored,
      numberOfFrames,
      pixelDataOffset: pixelDataElement.dataOffset,
      isSigned: pixelRepresentation === 1,
      isMonochrome1: photometric === 'MONOCHROME1',
      windowCenter: this.firstFloat(dataSet.floatString('x00281050')),
      windowWidth: this.firstFloat(dataSet.floatString('x00281051')),
      rescaleSlope: dataSet.floatString('x00281053') ?? 1,
      rescaleIntercept: dataSet.floatString('x00281052') ?? 0,
    };
  }

  private frameToJpeg(p: ParsedDicom, buffer: Buffer, frame: number): sharp.Sharp {
    const frameSize = p.rows * p.cols * (p.bitsAllocated / 8);
    const frameBuffer = Buffer.from(
      buffer.buffer,
      buffer.byteOffset + p.pixelDataOffset + frame * frameSize,
      frameSize,
    );
    const grayscale = this.toGrayscale8Bit({ ...p, frameBuffer });
    return sharp(grayscale, {
      raw: { width: p.cols, height: p.rows, channels: 1 },
    }).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' });
  }

  /** Sirve un frame convertido; la URL la devuelve `convert` y exige `file.consultar`. */
  serveFrame(sessionId: string, filename: string, res: any): void {
    assertFolderId(sessionId, 'sessionId');
    assertSafeFileName(filename);
    const fullPath = resolveUploadPath(
      this.uploadsDir,
      this.tmpFolder,
      sessionId,
      filename,
    );
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Imagen convertida no encontrada.');
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(fullPath).pipe(res);
  }

  /* ============================================================
   * 🧮 HELPERS
   * ============================================================ */

  /**
   * @summary Aplicar Window/Level y empacar a 8 bits en escala de grises.
   */
  private toGrayscale8Bit(params: {
    frameBuffer: Buffer;
    rows: number;
    cols: number;
    bitsAllocated: number;
    bitsStored: number;
    isSigned: boolean;
    rescaleSlope: number;
    rescaleIntercept: number;
    windowCenter: number | null;
    windowWidth: number | null;
    isMonochrome1: boolean;
  }): Buffer {
    const {
      frameBuffer,
      rows,
      cols,
      bitsAllocated,
      isSigned,
      rescaleSlope,
      rescaleIntercept,
      isMonochrome1,
    } = params;

    const pixelCount = rows * cols;
    const values = new Float32Array(pixelCount);

    // 1) Decodificar valores crudos a Float32 aplicando rescale (Modality LUT).
    if (bitsAllocated === 16) {
      const view = new DataView(
        frameBuffer.buffer,
        frameBuffer.byteOffset,
        frameBuffer.byteLength,
      );
      for (let i = 0; i < pixelCount; i++) {
        const raw = isSigned
          ? view.getInt16(i * 2, true)
          : view.getUint16(i * 2, true);
        values[i] = raw * rescaleSlope + rescaleIntercept;
      }
    } else if (bitsAllocated === 8) {
      for (let i = 0; i < pixelCount; i++) {
        const raw = isSigned
          ? frameBuffer.readInt8(i)
          : frameBuffer.readUInt8(i);
        values[i] = raw * rescaleSlope + rescaleIntercept;
      }
    } else {
      throw new BadRequestException(
        `Profundidad de píxel no soportada: ${bitsAllocated} bits.`,
      );
    }

    // 2) Determinar Window/Level. Si el DICOM no provee uno, se calcula
    //    a partir del min/max real del frame.
    let center: number;
    let width: number;
    if (
      params.windowCenter === null ||
      params.windowWidth === null ||
      params.windowWidth === 0
    ) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < pixelCount; i++) {
        const v = values[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      width = Math.max(max - min, 1);
      center = (max + min) / 2;
    } else {
      center = params.windowCenter;
      width = params.windowWidth;
    }

    const lower = center - 0.5 - (width - 1) / 2;
    const upper = center - 0.5 + (width - 1) / 2;
    const range = upper - lower;

    // 3) Mapear a 8 bits aplicando la ventana e invertir si MONOCHROME1.
    const out = Buffer.allocUnsafe(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      let v: number;
      const raw = values[i];
      if (raw <= lower) v = 0;
      else if (raw > upper) v = 255;
      else v = Math.round(((raw - lower) / range) * 255);
      out[i] = isMonochrome1 ? 255 - v : v;
    }

    return out;
  }

  /**
   * @summary Devolver true si la Transfer Syntax es procesable sin descompresión.
   */
  private isSupportedTransferSyntax(uid: string): boolean {
    return (
      uid === '1.2.840.10008.1.2' || // Implicit VR Little Endian
      uid === '1.2.840.10008.1.2.1' || // Explicit VR Little Endian
      uid === '1.2.840.10008.1.2.2' // Explicit VR Big Endian (raro)
    );
  }

  /**
   * @summary Tomar el primer valor de un Window Center/Width multi-valor.
   */
  private firstFloat(value: number | undefined): number | null {
    if (value === undefined || Number.isNaN(value)) return null;
    return value;
  }
}
