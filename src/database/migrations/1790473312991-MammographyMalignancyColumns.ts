import { MigrationInterface, QueryRunner } from "typeorm";

// M-40: probability is the class confidence; store the malignancy probability and the raw sigmoid next to it.

export class MammographyMalignancyColumns1790473312991 implements MigrationInterface {
    name = 'MammographyMalignancyColumns1790473312991'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD "malignancy_probability" numeric(5,2)`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD "raw_score" double precision`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD "threshold" double precision`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD "model_version" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" ADD "notes" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP COLUMN "notes"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP COLUMN "model_version"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP COLUMN "threshold"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP COLUMN "raw_score"`);
        await queryRunner.query(`ALTER TABLE "mammography_analyses" DROP COLUMN "malignancy_probability"`);
    }

}
