import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { RecipeService } from './recipe.service';
import { RecipeController } from './recipe.controller';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';
import { User } from 'src/user/entities/user.entity';
import { FilesModule } from 'src/files/files.module';
import { DocumentsModule } from 'src/documents/documents.module';
import { EmailModule } from 'src/email/email.module';
import { AccessLog } from 'src/audit/entities/access-log.entity';
import { RecipeVerificationController } from './recipe-verification.controller';
import { RecipeVerificationService } from './recipe-verification.service';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature(
      [Recipe, RecipeItem, Patient, Doctor, MedicalHistory, User, AccessLog],
      DatabaseConnectionName.DB_MAIN,
    ),
    FilesModule,
    DocumentsModule,
    EmailModule,
  ],
  controllers: [RecipeController, RecipeVerificationController],
  providers: [RecipeService, RecipeVerificationService],
  exports: [RecipeService],
})
export class RecipeModule {}
