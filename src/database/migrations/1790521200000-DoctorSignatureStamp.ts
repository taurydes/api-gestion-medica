import { MigrationInterface, QueryRunner } from "typeorm";

// Private signature and stamp images printed on the recipe PDF; paths are relative to UPLOADS_PATH.
export class DoctorSignatureStamp1790521200000 implements MigrationInterface {
    name = 'DoctorSignatureStamp1790521200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctors" ADD "signature_path" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "doctors" ADD "stamp_path" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN "stamp_path"`);
        await queryRunner.query(`ALTER TABLE "doctors" DROP COLUMN "signature_path"`);
    }
}
