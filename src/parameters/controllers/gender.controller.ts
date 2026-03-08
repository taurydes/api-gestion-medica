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

import { CreateGenderDto } from '../dto/create/create-gender.dto';
import { UpdateGenderDto } from '../dto/update/update-gender.dto';
import { Gender } from '../entities/gender.entity';
import { GenderService } from '../services/gender.service';
import { GenderQueryDto } from '../dto/query/gender-query.dto';
import { Public } from 'src/auth/decorators/public.decorator';


@ApiTags('Gender')
@Public()
@Controller('gender')
export class GenderController {
  constructor(private readonly service: GenderService) {}

  @Get()
  @ApiOperation({ summary: 'List all genders (paginated & filtered)' })
  findAll(@Query() query: GenderQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find gender by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
