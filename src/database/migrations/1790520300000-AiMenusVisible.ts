import { MigrationInterface, QueryRunner } from "typeorm";

// MJ-10: the AI screens had hidden menus, one of them misnamed "Citas Médicas"; both become visible links.
const CLINICAL_PARENT = '15c14300-6810-459e-bb53-cd1dd4ac62c9';

export class AiMenusVisible1790520300000 implements MigrationInterface {
    name = 'AiMenusVisible1790520300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "seguridad"."menu"
             SET "nombre" = 'Bandeja de análisis IA', "icono" = 'fa-inbox', "url" = '/machine-learning/review-inbox',
                 "es_visible" = true, "orden" = 80,
                 "menu_id" = (SELECT "id" FROM "seguridad"."menu" WHERE "id" = $1 AND "deleted_at" IS NULL),
                 "updated_at" = now()
             WHERE "slug" = 'mammography-analysis'`,
            [CLINICAL_PARENT],
        );
        await queryRunner.query(
            `UPDATE "seguridad"."menu"
             SET "nombre" = 'Detector IA', "url" = '/machine-learning/cancer-detector', "es_visible" = true, "orden" = 85,
                 "updated_at" = now()
             WHERE "slug" = 'machine-learning'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "seguridad"."menu"
             SET "nombre" = 'Citas Médicas', "icono" = 'calendar_month', "url" = '#', "es_visible" = false, "orden" = 50,
                 "menu_id" = NULL, "updated_at" = now()
             WHERE "slug" = 'mammography-analysis'`,
        );
        await queryRunner.query(
            `UPDATE "seguridad"."menu"
             SET "nombre" = 'Machine Learning', "url" = '#', "es_visible" = false, "orden" = 80, "updated_at" = now()
             WHERE "slug" = 'machine-learning'`,
        );
    }
}
