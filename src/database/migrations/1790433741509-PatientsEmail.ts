import { MigrationInterface, QueryRunner } from "typeorm";

// Patients had no contact email: the forms collected it and whitelist dropped it.
export class PatientsEmail1790433741509 implements MigrationInterface {
    name = 'PatientsEmail1790433741509'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patients" ADD "email" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patients" DROP COLUMN "email"`);
    }

}
