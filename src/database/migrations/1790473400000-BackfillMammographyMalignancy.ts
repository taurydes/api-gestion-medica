import { MigrationInterface, QueryRunner } from "typeorm";

// M-40 data: rows saved before server-side prediction only have the class confidence.
// With the detector logic of that time, MALIGNANT -> confidence = malignancy, BENIGN -> 100 - confidence.
export class BackfillMammographyMalignancy1790473400000 implements MigrationInterface {
    name = 'BackfillMammographyMalignancy1790473400000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "mammography_analyses"
               SET "malignancy_probability" = CASE WHEN "prediction" = 'MALIGNANT'
                                                   THEN "probability" ELSE 100 - "probability" END,
                   "raw_score" = 1 - (CASE WHEN "prediction" = 'MALIGNANT'
                                           THEN "probability" ELSE 100 - "probability" END) / 100.0
             WHERE "malignancy_probability" IS NULL
               AND "model_version" IS NULL
               AND "prediction" IN ('MALIGNANT', 'BENIGN')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Detector-produced rows always carry model_version; only backfilled rows are cleared.
        await queryRunner.query(`
            UPDATE "mammography_analyses"
               SET "malignancy_probability" = NULL, "raw_score" = NULL
             WHERE "model_version" IS NULL`);
    }

}
