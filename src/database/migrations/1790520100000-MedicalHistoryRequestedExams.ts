import { MigrationInterface, QueryRunner } from "typeorm";

// Exams ordered at the consultation were only sent as free text in the treatment plan (MJ-31).
export class MedicalHistoryRequestedExams1790520100000 implements MigrationInterface {
    name = 'MedicalHistoryRequestedExams1790520100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "medical_histories" ADD "requested_exams" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "medical_histories" DROP COLUMN "requested_exams"`);
    }
}
