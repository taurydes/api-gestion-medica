import { Injectable } from '@nestjs/common';
import { CreateParameterDto } from './dto/create-parameter.dto';
import { UpdateParameterDto } from './dto/update-parameter.dto';

@Injectable()
export class ParametersService {
  create(createParameterDto: CreateParameterDto) {
    return 'This action adds a new parameter';
  }

  findAll() {
    return `This action returns all parameters`;
  }

  findOne(id: number) {
    return `This action returns a #${id} parameter`;
  }

  update(id: number, updateParameterDto: UpdateParameterDto) {
    return `This action updates a #${id} parameter`;
  }

  remove(id: number) {
    return `This action removes a #${id} parameter`;
  }
}
