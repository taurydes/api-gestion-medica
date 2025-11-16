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
import { QueueService } from '../services/queue.service';
import { CreateQueueDto } from '../dto/create/create-queue.dto';
import { UpdateQueueDto } from '../dto/update/update-queue.dto';
import { QueueQueryDto } from '../dto/query/queue-query.dto';
import { Queue } from '../entities/queue.entity';
import { Public } from 'src/auth/decorators/public.decorator';
import { Permission } from 'src/auth/decorators/permission.decorator';

@ApiTags('Queue')
@Public()
@Controller('queue')
export class QueueController {
  constructor(private readonly service: QueueService) {}

  @Post()
  @ApiOperation({ summary: 'Create queue' })
  @ApiResponse({ status: 201, description: 'Queue created', type: Queue })
  @Permission('create:queue')
  create(@Body() dto: CreateQueueDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List queues (paginated & filtered)' })
  findAll(@Query() query: QueueQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find queue by ID' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update queue' })
  @Permission('update:queue')
  update(@Param('id') id: string, @Body() dto: UpdateQueueDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete queue' })
  @Permission('delete:queue')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
