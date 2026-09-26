import { MigrationInterface, QueryRunner } from "typeorm";

export class PatientsPartialUniquePerson1790384775327 implements MigrationInterface {
    name = 'PatientsPartialUniquePerson1790384775327'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "FK_f34e740f037fa739f119134c565"`);
        await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "UQ_f34e740f037fa739f119134c565"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_patients_common_person_active" ON "patients" ("common_person_id") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "FK_f34e740f037fa739f119134c565" FOREIGN KEY ("common_person_id") REFERENCES "persona_comun"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patients" DROP CONSTRAINT "FK_f34e740f037fa739f119134c565"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_patients_common_person_active"`);
        await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "UQ_f34e740f037fa739f119134c565" UNIQUE ("common_person_id")`);
        await queryRunner.query(`ALTER TABLE "patients" ADD CONSTRAINT "FK_f34e740f037fa739f119134c565" FOREIGN KEY ("common_person_id") REFERENCES "persona_comun"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
