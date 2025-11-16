import { PartialType } from '@nestjs/swagger';
import { CreateQueueDto } from '../create/create-queue.dto';

export class UpdateQueueDto extends PartialType(CreateQueueDto) {}
