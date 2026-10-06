import { MigrationInterface, QueryRunner } from "typeorm";

// The nightly error-log purge and the logs screen filter by occurred_at; without this index both scan the table.
export class ErrorLogOccurredAtIndex1790521500000 implements MigrationInterface {
    name = 'ErrorLogOccurredAtIndex1790521500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "idx_error_log_occurred_at" ON "auditoria"."error_log" ("occurred_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "auditoria"."idx_error_log_occurred_at"`);
    }
}
