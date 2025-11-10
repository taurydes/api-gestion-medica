import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullBoardController } from './bull-board.controller';
import { BullBoardService } from './bull-board.service';
import { QueuesModule } from '../queues.module';

@Module({
  imports: [ConfigModule, QueuesModule],
  controllers: [BullBoardController],
  providers: [BullBoardService],
  exports: [BullBoardService],
})
export class BullBoardModule {}
