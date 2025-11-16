import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CivilStatusService } from '../services/civil-status.service';
import { CreateCivilStatusDto } from '../dto/create/create-civil-status.dto';
import { UpdateCivilStatusDto } from '../dto/update/update-civil-status.dto';
import { CivilStatus } from '../entities/civil-status.entity';
import { CivilStatusQueryDto } from '../dto/query/civil-status-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';


@ApiTags('Civil Status')
@Public()
@Controller('civil-status')
export class CivilStatusController {
  constructor(private readonly service: CivilStatusService) {}

  @Get()
  @ApiOperation({ summary: 'Get all civil status records (paginated & filtered)' })
  findAll(@Query() query: CivilStatusQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get civil status by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
}
