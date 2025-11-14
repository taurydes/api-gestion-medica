import {
  Controller,
  Get,
  Param
} from '@nestjs/common';
import { ParametersService } from './parameters.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Parameters')
@Controller('Parameters')
export class ParametersController {
  constructor(private readonly parametersService: ParametersService) {}

  // -------------------------------------------------
  // LIST
  // -------------------------------------------------
  @Get()
  @ApiOperation({
    summary: 'List all kiosks',
    description: 'Returns a list of all kiosks in the system.',
  })
  async list() {
    return await this.parametersService.listKiosko();
  }

  // -------------------------------------------------
  // FIND ONE
  // -------------------------------------------------
  @Get(':id')
  @ApiOperation({
    summary: 'Get a kiosk by ID',
    description: 'Returns the kiosk details for the given ID.',
  })
  async findOne(@Param('id') id: number) {
    return await this.parametersService.findKiosko(id);
  }
}
