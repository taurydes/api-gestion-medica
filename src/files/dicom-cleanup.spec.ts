import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DICOM_CONVERSION_TTL_MS, DicomConverterService } from './dicom-converter.service';

const HOUR = 60 * 60 * 1000;

function setup() {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'dicom-sweep-'));
  const root = path.join(uploads, 'dicom-conversions');
  const session = (name: string, ageMs: number) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'frame-0.jpg'), Buffer.from([0xff, 0xd8]));
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(dir, when, when);
    return dir;
  };
  const service = new DicomConverterService({ get: (k: string) => (k === 'UPLOADS_PATH' ? uploads : undefined) } as any);
  return { service, session, root };
}

describe('DICOM preview conversions are swept by age (MJ-42)', () => {
  it('removes folders older than 24 h and keeps recent ones', () => {
    const { service, session } = setup();
    const old = session('old-session', DICOM_CONVERSION_TTL_MS + HOUR);
    const fresh = session('fresh-session', HOUR);

    expect(service.removeExpiredConversions()).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('no conversions folder yet → nothing to do', () => {
    const service = new DicomConverterService({ get: () => fs.mkdtempSync(path.join(os.tmpdir(), 'dicom-none-')) } as any);
    expect(service.removeExpiredConversions()).toBe(0);
  });

  it('starts sweeping on module init and stops on destroy', () => {
    jest.useFakeTimers();
    try {
      const { service, session } = setup();
      const spy = jest.spyOn(service, 'removeExpiredConversions');
      session('old-session', DICOM_CONVERSION_TTL_MS + HOUR);

      service.onModuleInit();
      expect(spy).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(HOUR);
      expect(spy).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      jest.advanceTimersByTime(3 * HOUR);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
