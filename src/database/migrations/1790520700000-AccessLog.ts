import { MigrationInterface, QueryRunner } from "typeorm";

// MJ-39: only exceptions were recorded; this table keeps who wrote anything and who read clinical data.
export class AccessLog1790520700000 implements MigrationInterface {
    name = 'AccessLog1790520700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "auditoria"."access_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "http_method" character varying(10) NOT NULL, "path" character varying(500) NOT NULL, "resource" character varying(60) NOT NULL, "resource_id" character varying(64), "action" character varying(5) NOT NULL, "status_code" integer NOT NULL, "ip" character varying(64), CONSTRAINT "PK_access_log_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_access_log_created_at" ON "auditoria"."access_log" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "idx_access_log_user" ON "auditoria"."access_log" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_access_log_resource" ON "auditoria"."access_log" ("resource", "resource_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "auditoria"."idx_access_log_resource"`);
        await queryRunner.query(`DROP INDEX "auditoria"."idx_access_log_user"`);
        await queryRunner.query(`DROP INDEX "auditoria"."idx_access_log_created_at"`);
        await queryRunner.query(`DROP TABLE "auditoria"."access_log"`);
    }
}
