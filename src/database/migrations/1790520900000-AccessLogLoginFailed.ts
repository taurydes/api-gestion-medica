import { MigrationInterface, QueryRunner } from "typeorm";

// Failed logins join the access trail as action 'login_failed'; the column only held 'read' | 'write'.
export class AccessLogLoginFailed1790520900000 implements MigrationInterface {
    name = 'AccessLogLoginFailed1790520900000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "auditoria"."access_log" ALTER COLUMN "action" TYPE character varying(20)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Rows that no longer fit the narrow column are the ones this migration made possible.
        await queryRunner.query(`DELETE FROM "auditoria"."access_log" WHERE "action" NOT IN ('read', 'write')`);
        await queryRunner.query(`ALTER TABLE "auditoria"."access_log" ALTER COLUMN "action" TYPE character varying(5)`);
    }
}
