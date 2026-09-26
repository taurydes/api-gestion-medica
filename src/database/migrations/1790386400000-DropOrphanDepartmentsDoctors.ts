import { MigrationInterface, QueryRunner } from "typeorm";

// parametro.departments_doctors is a leftover of synchronize(); the entity uses public.departments_doctors (M-24).
export class DropOrphanDepartmentsDoctors1790386400000 implements MigrationInterface {
    name = 'DropOrphanDepartmentsDoctors1790386400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable('parametro.departments_doctors'))) return;
        const [{ rows }] = await queryRunner.query(`SELECT count(*)::int AS rows FROM "parametro"."departments_doctors"`);
        if (rows > 0) {
            throw new Error(`parametro.departments_doctors has ${rows} row(s); it was expected to be empty. Review before dropping.`);
        }
        await queryRunner.query(`DROP TABLE "parametro"."departments_doctors"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "parametro"."departments_doctors" ("department_id" uuid, "doctor_id" uuid)`);
        await queryRunner.query(`CREATE INDEX "idx_departments_doctors_department_id" ON "parametro"."departments_doctors" ("department_id")`);
        await queryRunner.query(`CREATE INDEX "idx_departments_doctors_doctor_id" ON "parametro"."departments_doctors" ("doctor_id")`);
        await queryRunner.query(`ALTER TABLE "parametro"."departments_doctors" ADD CONSTRAINT "FK_239859b9f057a5067b657549dd1" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id")`);
        await queryRunner.query(`ALTER TABLE "parametro"."departments_doctors" ADD CONSTRAINT "FK_d93bbafa2dc0a21daf15ae7e593" FOREIGN KEY ("department_id") REFERENCES "parametro"."departments"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }
}
