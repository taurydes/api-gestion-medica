import { MigrationInterface, QueryRunner } from "typeorm";

export class ClinicalFksRestrict1790386338537 implements MigrationInterface {
    name = 'ClinicalFksRestrict1790386338537'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_346f79a689d013533a8b6f1c7dd"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_499c19b31792aaab9186e8b0768"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_68eaed508c72b3758b20c20db08"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_c7db2b2ac918f45128f98cb3a30"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_23c3009b42b8d791afa709ad351"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_b606c06ec0015cfc8da3427e225"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_346f79a689d013533a8b6f1c7dd" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_499c19b31792aaab9186e8b0768" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_68eaed508c72b3758b20c20db08" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_c7db2b2ac918f45128f98cb3a30" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_23c3009b42b8d791afa709ad351" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_b606c06ec0015cfc8da3427e225" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_b606c06ec0015cfc8da3427e225"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" DROP CONSTRAINT "FK_23c3009b42b8d791afa709ad351"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_c7db2b2ac918f45128f98cb3a30"`);
        await queryRunner.query(`ALTER TABLE "recipes" DROP CONSTRAINT "FK_68eaed508c72b3758b20c20db08"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_499c19b31792aaab9186e8b0768"`);
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP CONSTRAINT "FK_346f79a689d013533a8b6f1c7dd"`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_b606c06ec0015cfc8da3427e225" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_appointments" ADD CONSTRAINT "FK_23c3009b42b8d791afa709ad351" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_c7db2b2ac918f45128f98cb3a30" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "recipes" ADD CONSTRAINT "FK_68eaed508c72b3758b20c20db08" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_499c19b31792aaab9186e8b0768" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD CONSTRAINT "FK_346f79a689d013533a8b6f1c7dd" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
