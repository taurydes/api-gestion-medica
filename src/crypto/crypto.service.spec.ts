import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeAll(() => {
    process.env.ENCRYPT_KEY ??= 'test-encrypt-key-0123456789';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService],
    })
      // Dependencias sin implementación: estas specs solo comprueban la inyección
      .useMocker(() => ({}))
      .compile();

    service = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
