import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessLog } from 'src/audit/entities/access-log.entity';
import { DatabaseConnectionName } from 'src/database/DatabaseConnectionName';
import { fullName } from 'src/documents/recipe-pdf.builder';
import { Recipe } from './entities/recipe.entity';
import { VERIFICATION_CODE_PATTERN } from './recipe-verification.util';

/** Public answer of the anti-forgery check: no clinical data, no items, no diagnosis. */
export type RecipeVerification =
  | {
      valid: true;
      recipeNumber: string;
      issuedAt: Date;
      status: string;
      doctor: { fullName: string; license: string | null; specialty: string | null };
      center: { name: string | null };
      patientInitials: string;
    }
  | { valid: false; status?: string };

const INVALID_STATUSES = new Set(['cancelled']);

/** "A.P.G." from the patient's names; never the full name. */
export function initials(person?: { firstName?: string | null; lastName?: string | null; secondLastName?: string | null } | null): string {
  return [person?.firstName, person?.lastName, person?.secondLastName]
    .map((part) => (part ?? '').trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .map((letter) => `${letter}.`)
    .join('');
}

/** Looks a printed recipe up by its verification code and records every lookup in the access trail. */
@Injectable()
export class RecipeVerificationService {
  private readonly logger = new Logger(RecipeVerificationService.name);

  constructor(
    @InjectRepository(Recipe, DatabaseConnectionName.DB_MAIN)
    private readonly recipeRepository: Repository<Recipe>,
    @InjectRepository(AccessLog, DatabaseConnectionName.DB_MAIN)
    private readonly accessLog: Repository<AccessLog>,
  ) {}

  /** `found` is false only for an unknown code (the controller answers 404). */
  async verify(code: string, ip: string | null): Promise<{ found: boolean; body: RecipeVerification }> {
    const recipe = VERIFICATION_CODE_PATTERN.test(code)
      ? await this.recipeRepository.findOne({
          where: { verificationCode: code },
          relations: {
            patient: { commonPerson: true },
            doctor: { commonPerson: true, specialties: true },
            medicalHistory: { medicalCenter: true, specialty: true },
          },
        })
      : null;

    const body = recipe ? this.describe(recipe) : ({ valid: false } as const);
    await this.record(recipe?.id ?? null, recipe ? 200 : 404, ip);
    return { found: !!recipe, body };
  }

  private describe(recipe: Recipe): RecipeVerification {
    if (recipe.deletedAt) return { valid: false, status: 'deleted' };
    if (INVALID_STATUSES.has(recipe.status)) return { valid: false, status: recipe.status };
    return {
      valid: true,
      recipeNumber: recipe.recipeNumber,
      issuedAt: recipe.issueDate,
      status: recipe.status,
      doctor: {
        fullName: `Dr(a). ${fullName(recipe.doctor?.commonPerson)}`,
        license: recipe.doctor?.licenseNumber ?? null,
        specialty: recipe.medicalHistory?.specialty?.name ?? recipe.doctor?.specialties?.[0]?.name ?? null,
      },
      center: { name: recipe.medicalHistory?.medicalCenter?.name ?? null },
      patientInitials: initials(recipe.patient?.commonPerson),
    };
  }

  // The code is not stored: the recipe id identifies a hit, and a miss keeps only status and IP.
  private async record(recipeId: string | null, statusCode: number, ip: string | null): Promise<void> {
    await this.accessLog
      .insert({
        userId: null,
        method: 'GET',
        path: '/public/recipes/verify',
        resource: 'recipes',
        resourceId: recipeId,
        action: 'recipe_verify',
        statusCode,
        ip: ip?.slice(0, 64) || null,
      })
      .catch((error) => this.logger.error(`No se pudo registrar la verificación: ${error.message}`));
  }
}
