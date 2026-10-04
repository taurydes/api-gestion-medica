import { MigrationInterface, QueryRunner } from "typeorm";

// MJ-33 structured agreement, MJ-37 withdrawal with reason, MJ-44 one live analysis per file.
export class MammographyAgreementAndSingleAnalysis1790520600000 implements MigrationInterface {
    name = 'MammographyAgreementAndSingleAnalysis1790520600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" ADD "doctor_agreement" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" ADD "review_agreement" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" ADD "deletion_reason" text`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" ADD "deleted_by" uuid`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" ADD CONSTRAINT "CHK_mammography_analyses_doctor_agreement" CHECK ("doctor_agreement" IN ('accepted', 'rejected', 'uncertain'))`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" ADD CONSTRAINT "CHK_mammography_analyses_review_agreement" CHECK ("review_agreement" IN ('accepted', 'rejected', 'uncertain'))`);
        // Same rule as docs/info/migrations/2026-10-04-analisis-duplicados-y-acuerdo.sql, so the index cannot fail
        // on a database where that script was not run: keep the reviewed, then the newest, analysis of each file.
        await queryRunner.query(
            `UPDATE "public"."mammography_analyses" a
             SET "deleted_at" = now(), "deletion_reason" = 'Duplicado del mismo archivo (MJ-44)'
             FROM (
               SELECT "id", row_number() OVER (PARTITION BY "appointment_file_id" ORDER BY "is_reviewed" DESC, "created_at" DESC) AS rn
               FROM "public"."mammography_analyses"
               WHERE "appointment_file_id" IS NOT NULL AND "deleted_at" IS NULL
             ) d
             WHERE a."id" = d."id" AND d.rn > 1`,
        );
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_mammography_analyses_file_active" ON "public"."mammography_analyses" ("appointment_file_id") WHERE "appointment_file_id" IS NOT NULL AND "deleted_at" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_mammography_analyses_file_active"`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" DROP CONSTRAINT "CHK_mammography_analyses_review_agreement"`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" DROP CONSTRAINT "CHK_mammography_analyses_doctor_agreement"`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" DROP COLUMN "deleted_by"`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" DROP COLUMN "deletion_reason"`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" DROP COLUMN "review_agreement"`);
        await queryRunner.query(`ALTER TABLE "public"."mammography_analyses" DROP COLUMN "doctor_agreement"`);
    }
}
