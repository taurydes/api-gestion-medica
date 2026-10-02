import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import {
  ANALYSIS_IMAGE_MAX_BYTES,
  DICOM_MAX_BYTES,
  UploadLimitMessageInterceptor,
  tooLargeMessage,
} from './upload-limits';

async function errorThrough(err: unknown): Promise<any> {
  const interceptor = new UploadLimitMessageInterceptor(DICOM_MAX_BYTES);
  try {
    await lastValueFrom(interceptor.intercept({} as any, { handle: () => throwError(() => err) }));
  } catch (caught) {
    return caught;
  }
  throw new Error('expected an error');
}

describe('UploadLimitMessageInterceptor (H-02)', () => {
  it("multer's 'File too large' → 413 with the interceptor's limit in Spanish", async () => {
    const out = await errorThrough(new PayloadTooLargeException('File too large'));
    expect(out).toBeInstanceOf(PayloadTooLargeException);
    expect(out.message).toBe(tooLargeMessage(DICOM_MAX_BYTES));
  });

  it("the service's raster 413 keeps its 20 MB message", async () => {
    const out = await errorThrough(
      new PayloadTooLargeException(tooLargeMessage(ANALYSIS_IMAGE_MAX_BYTES)),
    );
    expect(out.message).toBe('El archivo supera el tamaño máximo permitido (20 MB).');
  });

  it('other errors pass unchanged', async () => {
    const err = new BadRequestException('x');
    expect(await errorThrough(err)).toBe(err);
  });
});
