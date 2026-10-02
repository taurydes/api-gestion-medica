import { MigrationInterface, QueryRunner } from "typeorm";

// Codes came from max+1 (a race ended in a 500 on the unique index); each one now draws from a sequence.
// setval starts past the highest numeric suffix of any year, so no new code repeats an existing one.
const SEQUENCES: [sequence: string, table: string, column: string][] = [
    ['seq_appointment_number', 'medical_appointments', 'appointment_number'],
    ['seq_consultation_number', 'medical_histories', 'consultation_number'],
    ['seq_recipe_number', 'recipes', 'recipe_number'],
    ['seq_patient_code', 'patients', 'patient_code'],
];

export class CodeSequences1790500000000 implements MigrationInterface {
    name = 'CodeSequences1790500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const [sequence, table, column] of SEQUENCES) {
            await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "public"."${sequence}" START 1`);
            await queryRunner.query(
                `SELECT setval('"public"."${sequence}"', COALESCE((SELECT MAX(CAST(split_part("${column}", '-', 3) AS integer)) FROM "public"."${table}" WHERE "${column}" ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'), 0) + 1, false)`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const [sequence] of SEQUENCES) {
            await queryRunner.query(`DROP SEQUENCE IF EXISTS "public"."${sequence}"`);
        }
    }

}
