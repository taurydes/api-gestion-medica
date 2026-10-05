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
import {
  buildRecipePdfDefinition,
  recipePdfFingerprint,
  renderPdf,
} from './recipe-pdf.builder';

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
    return resolveUploadPath(
      this.uploadsDir,
      DOCUMENTS_FOLDER,
      `${recipeId}.pdf`,
    );
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
    if (!recipe)
      throw new NotFoundException(`Receta con ID ${recipeId} no encontrada.`);
    return recipe;
  }

  /** Path of the recipe's PDF, regenerated only when the printed data's hash differs from the stored one. */
  async ensurePdf(
    recipeId: string,
  ): Promise<{ path: string; cached: boolean; recipeNumber: string }> {
    const recipe = await this.loadRecipe(recipeId);
    const target = this.filePath(recipe.id);
    // Hash of what the PDF prints, so a renamed doctor or patient also invalidates it (updatedAt would not).
    const hash = recipePdfFingerprint(recipe);
    const hashFile = `${target}.sha256`;
    const [stored, stat] = await Promise.all([
      fs.readFile(hashFile, 'utf8').catch(() => null),
      fs.stat(target).catch(() => null),
    ]);
    if (stat && stored?.trim() === hash) {
      return { path: target, cached: true, recipeNumber: recipe.recipeNumber };
    }

    const pdf = await renderPdf(buildRecipePdfDefinition(recipe));
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write then rename: two workers on the same recipe never leave a half-written file behind.
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, pdf);
    await fs.rename(tmp, target);
    // Hash after the PDF: a crash in between only costs one extra regeneration.
    const hashTmp = `${hashFile}.tmp-${randomUUID()}`;
    await fs.writeFile(hashTmp, hash);
    await fs.rename(hashTmp, hashFile);
    return { path: target, cached: false, recipeNumber: recipe.recipeNumber };
  }
}
