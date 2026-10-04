import { MigrationInterface, QueryRunner } from "typeorm";

// MJ-39 follow-up: the access-log screen exists in the frontend, so the hidden "Logs" menu gets its name and URL.
export class LogsMenuAccessLog1790520800000 implements MigrationInterface {
    name = 'LogsMenuAccessLog1790520800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "seguridad"."menu"
             SET "nombre" = 'Bitácora de accesos', "url" = '/audit/access-log', "es_visible" = true, "updated_at" = now()
             WHERE "slug" = 'logs' AND "deleted_at" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "seguridad"."menu"
             SET "nombre" = 'Logs', "url" = '#', "es_visible" = false, "updated_at" = now()
             WHERE "slug" = 'logs' AND "deleted_at" IS NULL`,
        );
    }
}
