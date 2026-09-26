import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M-19, NOT applied: move to ../migrations after docs/info/migrations/2026-09-25-depurar-especialidad-mt.sql
 * and declare both indexes on Specialty with { synchronize: false } (see the phase 1 task doc).
 */
export class SpecialtiesUniqueCodeAndName1790399100000 implements MigrationInterface {
    name = 'SpecialtiesUniqueCodeAndName1790399100000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const duplicates = await queryRunner.query(
            `SELECT code FROM "parametro"."specialties" WHERE "deleted_at" IS NULL AND "code" IS NOT NULL GROUP BY code HAVING count(*) > 1`,
        );
        if (duplicates.length > 0) {
            throw new Error(`parametro.specialties still has duplicated codes (${duplicates.map((d) => d.code).join(', ')}); run the M-19 cleanup first.`);
        }
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_specialties_code_active" ON "parametro"."specialties" ("code") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_specialties_name_lower_active" ON "parametro"."specialties" (lower("name")) WHERE "deleted_at" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "parametro"."UQ_specialties_name_lower_active"`);
        await queryRunner.query(`DROP INDEX "parametro"."UQ_specialties_code_active"`);
    }
}
