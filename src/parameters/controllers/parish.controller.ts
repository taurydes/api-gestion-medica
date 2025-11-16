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
import { CreateParishDto } from '../dto/create/create-parish.dto';
import { ParishQueryDto } from '../dto/query/parish-query.dto';
import { UpdateParishDto } from '../dto/update/update-parish.dto';
import { Parish } from '../entities/parish.entity';
import { ParishService } from '../services/parish.service';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('Parish')
@Public()
@Controller('parish')
export class ParishController {
  constructor(private readonly service: ParishService) {}

  @Get()
  @ApiOperation({ summary: 'List parishes (paginated & filtered)' })
  findAll(@Query() query: ParishQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find parish by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }
}
