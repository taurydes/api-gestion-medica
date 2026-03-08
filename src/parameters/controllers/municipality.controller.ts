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
import { MunicipalityService } from '../services/municipality.service';
import { CreateMunicipalityDto } from '../dto/create/create-municipality.dto';
import { UpdateMunicipalityDto } from '../dto/update/update-municipality.dto';
import { Municipality } from '../entities/municipality.entity';
import { MunicipalityQueryDto } from '../dto/query/municipality-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';

@ApiTags('Municipality')
@Public()
@Controller('municipality')
export class MunicipalityController {
  constructor(private readonly service: MunicipalityService) {}


  @Get()
  @ApiOperation({
    summary: 'List municipalities (paginated & filtered)',
  })
  findAll(@Query() query: MunicipalityQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find municipality by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
