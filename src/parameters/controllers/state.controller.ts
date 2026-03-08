import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { StateService } from '../services/state.service';
import { StateQueryDto } from '../dto/query/state-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('State')
@Public()
@Controller('state')
export class StateController {
  constructor(private readonly service: StateService) {}

  @Get()
  @ApiOperation({ summary: 'Get all states with pagination' })
  findAll(@Query() query: StateQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get state by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/municipalities')
  @ApiOperation({ summary: 'Get a state and its municipalities' })
  @ApiParam({ name: 'id', example: 1 })
  findWithMunicipalities(@Param('id') id: string) {
    return this.service.findWithMunicipalities(id);
  }
}
