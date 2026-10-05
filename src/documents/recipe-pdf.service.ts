import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { resolveUploadPath } from 'src/files/upload-path.util';
import { Recipe } from 'src/recipe/entities/recipe.entity';
import { IsNull, Repository } from 'typeorm';
import { DOCUMENTS_FOLDER } from './documents.const';
import { buildRecipePdfDefinition, renderPdf } from './recipe-pdf.builder';

/** Loads a recipe with every relation the PDF prints and keeps one generated file per recipe. */
@Injectable()
export class RecipePdfService {
  private readonly uploadsDir: string;

  constructor(
    @InjectRepository(Recipe, DatabaseConnectionName.DB_MAIN)
    private readonly recipeRepository: Repository<Recipe>,
    config: ConfigService,
  ) {
    this.uploadsDir = config.get<string>('UPLOADS_PATH') || 'uploads';
  }

  filePath(recipeId: string): string {
    return resolveUploadPath(this.uploadsDir, DOCUMENTS_FOLDER, `${recipeId}.pdf`);
  }

  async loadRecipe(recipeId: string): Promise<Recipe> {
    const recipe = await this.recipeRepository.findOne({
      where: { id: recipeId, deletedAt: IsNull() },
      relations: {
        patient: { commonPerson: true },
        doctor: { commonPerson: true, specialties: true },
        medicalHistory: { medicalCenter: true, specialty: true },
        items: true,
      },
    });
    if (!recipe) throw new NotFoundException(`Receta con ID ${recipeId} no encontrada.`);
    return recipe;
  }

  /** Path of the recipe's PDF, regenerated only when the recipe's updatedAt differs from the file's stamp. */
  async ensurePdf(recipeId: string): Promise<{ path: string; cached: boolean }> {
    const recipe = await this.loadRecipe(recipeId);
    const target = this.filePath(recipe.id);
    const version = new Date(recipe.updatedAt).getTime();
    const stat = await fs.stat(target).catch(() => null);
    // The file's mtime is set to the recipe's updatedAt: an equality check, immune to clock or TZ skew.
    if (stat && Math.round(stat.mtimeMs) === version) {
      return { path: target, cached: true };
    }

    const pdf = await renderPdf(buildRecipePdfDefinition(recipe));
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write then rename: two workers on the same recipe never leave a half-written file behind.
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, pdf);
    await fs.utimes(tmp, new Date(), new Date(version));
    await fs.rename(tmp, target);
    return { path: target, cached: false };
  }
}
