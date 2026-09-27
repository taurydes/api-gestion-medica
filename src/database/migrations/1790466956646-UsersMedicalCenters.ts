import { MigrationInterface, QueryRunner } from "typeorm";

// Non-doctor staff had no link to centers, so /auth/me gave them none (fase 2).
export class UsersMedicalCenters1790466956646 implements MigrationInterface {
    name = 'UsersMedicalCenters1790466956646'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users_medical_centers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "medical_center_id" uuid NOT NULL, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "PK_023729848d946a3cc4c106130f0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_medical_centers_active" ON "users_medical_centers" ("user_id", "medical_center_id") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "users_medical_centers" ADD CONSTRAINT "FK_4eda4c29d6f6d1bde3d2077e215" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users_medical_centers" ADD CONSTRAINT "FK_c184bf76f3674ea5b99598d3278" FOREIGN KEY ("medical_center_id") REFERENCES "parametro"."medical_centers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users_medical_centers" DROP CONSTRAINT "FK_c184bf76f3674ea5b99598d3278"`);
        await queryRunner.query(`ALTER TABLE "users_medical_centers" DROP CONSTRAINT "FK_4eda4c29d6f6d1bde3d2077e215"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_medical_centers_active"`);
        await queryRunner.query(`DROP TABLE "users_medical_centers"`);
    }

}
