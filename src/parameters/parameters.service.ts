import { Injectable } from '@nestjs/common';
import { FindKioskoUseCase } from './use-cases/kiosko/find-kiosko.usecase';
import { ListKioskoUseCase } from './use-cases/kiosko/list-kiosko.usecase';


@Injectable()
export class ParametersService {
  constructor(
    private readonly findKioskoUC: FindKioskoUseCase,
    private readonly listKioskoUC: ListKioskoUseCase,
  ) {}

  async findKiosko(id: number) {
    return await this.findKioskoUC.execute(id);
  }

  async listKiosko() {
    return await this.listKioskoUC.execute();
  }
}
