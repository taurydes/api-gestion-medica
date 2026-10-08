import { ConfigService } from '@nestjs/config';
import { FilesService } from 'src/files/files.service';
import { buildPublicBaseUrl, resolvePublicBaseUrl } from './public-url';

const configOf = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('buildPublicBaseUrl', () => {
  it('uses a full https URL as-is, without appending the port', () => {
    expect(buildPublicBaseUrl('https://api.vibe.example.com', '8008')).toBe(
      'https://api.vibe.example.com',
    );
  });

  it('trims trailing slashes from a full URL', () => {
    expect(buildPublicBaseUrl('https://api.vibe.example.com//', '8008')).toBe(
      'https://api.vibe.example.com',
    );
  });

  it('keeps an explicit port written inside a full http URL', () => {
    expect(buildPublicBaseUrl('http://localhost:9000/', '8008')).toBe(
      'http://localhost:9000',
    );
  });

  it('keeps the legacy http://host:PORT for a bare host', () => {
    expect(buildPublicBaseUrl('localhost', '8008')).toBe(
      'http://localhost:8008',
    );
    expect(buildPublicBaseUrl('192.168.1.10', 7008)).toBe(
      'http://192.168.1.10:7008',
    );
  });

  it('falls back to localhost:8008 when nothing is configured', () => {
    expect(buildPublicBaseUrl(undefined, undefined)).toBe(
      'http://localhost:8008',
    );
    expect(buildPublicBaseUrl('  ', '')).toBe('http://localhost:8008');
  });
});

describe('resolvePublicBaseUrl', () => {
  it('reads URL_HOST and PORT from config', () => {
    expect(
      resolvePublicBaseUrl(
        configOf({ URL_HOST: 'https://api.vibe.example.com/', PORT: '8008' }),
      ),
    ).toBe('https://api.vibe.example.com');
    expect(
      resolvePublicBaseUrl(configOf({ URL_HOST: 'localhost', PORT: '8008' })),
    ).toBe('http://localhost:8008');
  });
});

describe('FilesService public file URLs', () => {
  it('builds file URLs from a full https URL_HOST without the internal port', async () => {
    const appointmentFileRepo = {
      find: jest.fn().mockResolvedValue([{ id: 'f1', filePath: 'a/b/c.png' }]),
    };
    const service = new FilesService(
      {} as any,
      appointmentFileRepo as any,
      {} as any,
      {} as any,
      {} as any,
      configOf({
        UPLOADS_PATH: 'uploads',
        URL_HOST: 'https://api.vibe.example.com/',
        PORT: '8008',
      }),
    );

    const [file] = await service.getFilesByAppointment(
      '3f2b8a54-8e1c-4b7a-9d2e-1c5f6a7b8c9d',
    );

    expect(file.url).toBe(
      'https://api.vibe.example.com/files/appointment-files/f1',
    );
  });
});
