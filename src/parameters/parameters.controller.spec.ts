import { Test, TestingModule } from '@nestjs/testing';
import { ParametersController } from './parameters.controller';
import { ParametersService } from './parameters.service';

describe('ParametersController', () => {
  let controller: ParametersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParametersController],
      providers: [ParametersService],
    }).compile();

    controller = module.get<ParametersController>(ParametersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
