import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { RecipeService } from './recipe.service';
import { RecipeController } from './recipe.controller';
import { Patient } from 'src/patient/entities/patient.entity';
import { Doctor } from 'src/doctors/entities/doctor.entity';
import { MedicalHistory } from 'src/medical-history/entities/medical-history.entity';

/**
 * Módulo de Recetas Médicas
 * Gestiona la emisión y control de recetas médicas
 * Incluye ítems de medicamentos con instrucciones de administración
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Recipe, RecipeItem, Patient, Doctor, MedicalHistory],
      DatabaseConnectionName.DB_MAIN,
    ),
  ],
  controllers: [RecipeController],
  providers: [RecipeService],
  exports: [RecipeService],
})
export class RecipeModule {}
