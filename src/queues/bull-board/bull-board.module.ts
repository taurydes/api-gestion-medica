import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { QueuesModule } from '../queues.module';
import { BullBoardController } from './bull-board.controller';
import { BullBoardService } from './bull-board.service';

@Module({
  imports: [ConfigModule, QueuesModule,AuthModule],
  controllers: [BullBoardController],
  providers: [BullBoardService],
  exports: [BullBoardService],
})
export class BullBoardModule {}
