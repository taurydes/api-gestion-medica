import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from 'src/common/common.module';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { QueuesModule } from 'src/queues/queues.module';
import { DoctorsModule } from 'src/doctors/doctors.module';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsProcessor } from './documents.processor';
import { DocumentsService } from './documents.service';
import { RecipePdfService } from './recipe-pdf.service';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    QueuesModule,
    DoctorsModule,
    TypeOrmModule.forFeature([Recipe], DatabaseConnectionName.DB_MAIN),
  ],
  controllers: [DocumentsController],
  providers: [RecipePdfService, DocumentsService, DocumentsProcessor],
  exports: [RecipePdfService, DocumentsService],
})
export class DocumentsModule {}
