import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessLog } from 'src/audit/entities/access-log.entity';
import { CommonModule } from 'src/common/common.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { DocumentsModule } from 'src/documents/documents.module';
import { MedicalAppointment } from 'src/medical-appointments/entities/medical-appointment.entity';
import { QueuesModule } from 'src/queues/queues.module';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { MailTransport } from './mail-transport';

/** Recipe and consultation emails through the `email` queue (nodemailer over SMTP). */
@Module({
  imports: [
    ConfigModule,
    CommonModule,
    QueuesModule,
    DocumentsModule,
    TypeOrmModule.forFeature(
      [Recipe, MedicalAppointment, AccessLog],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  providers: [MailTransport, EmailService, EmailProcessor],
  exports: [EmailService],
})
export class EmailModule {}
