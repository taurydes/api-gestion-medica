import { MigrationInterface, QueryRunner } from 'typeorm';

/** M-18 step 2: requires docs/info/migrations/2026-09-25-depurar-persona-comun-duplicada.sql first; aborts if duplicates remain. */
export class PersonaComunUniqueDocument1790399000000 implements MigrationInterface {
    name = 'PersonaComunUniqueDocument1790399000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        const duplicates = await queryRunner.query(
            `SELECT letra, count(*) FROM "persona_comun" WHERE "documento" IS NOT NULL AND "deleted_at" IS NULL GROUP BY letra, documento HAVING count(*) > 1`,
        );
        if (duplicates.length > 0) {
            throw new Error(`persona_comun still has ${duplicates.length} duplicated (letra, documento) group(s); run the M-18 cleanup first.`);
        }
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_persona_comun_documento_activo" ON "persona_comun" ("letra", "documento") WHERE "documento" IS NOT NULL AND "deleted_at" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_persona_comun_documento_activo"`);
    }
}
