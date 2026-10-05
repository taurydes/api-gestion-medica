import { MigrationInterface, QueryRunner } from "typeorm";

// Anti-forgery code printed as QR on the recipe PDF. Moves data: every existing recipe gets a random code.
export class RecipeVerificationCode1790521300000 implements MigrationInterface {
    name = 'RecipeVerificationCode1790521300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "recipes" ADD "verification_code" character varying(64)`);
        await queryRunner.query(`UPDATE "recipes" SET "verification_code" = replace(gen_random_uuid()::text, '-', '') WHERE "verification_code" IS NULL`);
        await queryRunner.query(`ALTER TABLE "recipes" ALTER COLUMN "verification_code" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_recipes_verification_code" ON "recipes" ("verification_code") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_recipes_verification_code"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP COLUMN "verification_code"`);
    }
}
