import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { QueuesModule } from 'src/queues/queues.module';
import { EmailProcessor } from 'src/queues/workers/email.processor';

@Module({
  imports: [QueuesModule],
  controllers: [EmailController],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
