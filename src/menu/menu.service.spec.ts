import { Test, TestingModule } from '@nestjs/testing';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  let service: MenuService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenuService],
    })
      // Dependencias sin implementación: estas specs solo comprueban la inyección
      .useMocker(() => ({}))
      .compile();

    service = module.get<MenuService>(MenuService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
