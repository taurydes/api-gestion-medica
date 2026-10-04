import { MigrationInterface, QueryRunner } from "typeorm";

// MJ-14: the AI tab followed the department name; an explicit flag replaces it.
export class DepartmentSupportsMammography1790520400000 implements MigrationInterface {
    name = 'DepartmentSupportsMammography1790520400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parametro"."departments" ADD "supports_mammography" boolean NOT NULL DEFAULT false`);
        // Seeds the flag from the rule it replaces (app MAMMOGRAPHY_DEPARTMENT_KEYWORDS), so no screen changes behavior.
        await queryRunner.query(
            `UPDATE "parametro"."departments" SET "supports_mammography" = true
             WHERE lower("name") LIKE '%mamograf%' OR lower("name") LIKE '%mastolog%'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parametro"."departments" DROP COLUMN "supports_mammography"`);
    }
}
