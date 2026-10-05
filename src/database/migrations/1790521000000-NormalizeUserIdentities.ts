import { MigrationInterface, QueryRunner } from 'typeorm';

/** Normalizes users' name/email (trim + lowercase) and moves the unique indexes onto lower(btrim(...)). */
export class NormalizeUserIdentities1790521000000 implements MigrationInterface {
    name = 'NormalizeUserIdentities1790521000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Duplicates after normalization keep the oldest row; the rest get a "-dupN" suffix (test data).
        await this.renameCollisions(queryRunner, 'public.users', 'name', `"deleted_at" IS NULL`);
        await this.renameCollisions(queryRunner, 'public.users', 'email', `"deleted_at" IS NULL`);
        await this.renameCollisions(queryRunner, 'seguridad.users', 'name', 'TRUE');
        await this.renameCollisions(queryRunner, 'seguridad.users', 'email', 'TRUE');

        for (const table of ['"public"."users"', '"seguridad"."users"']) {
            await queryRunner.query(
                `UPDATE ${table} SET "name" = lower(btrim("name")), "email" = lower(btrim("email"))
                 WHERE "name" <> lower(btrim("name")) OR "email" <> lower(btrim("email"))`,
            );
        }

        await queryRunner.query(`DROP INDEX "public"."UQ_users_name_active"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_email_active"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."users" DROP CONSTRAINT "UQ_51b8b26ac168fbe7d6f5653e6cf"`);
        await queryRunner.query(`ALTER TABLE "seguridad"."users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);

        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_name_normalized_active" ON "public"."users" (lower(btrim("name"))) WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_normalized_active" ON "public"."users" (lower(btrim("email"))) WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_seguridad_users_name_normalized" ON "seguridad"."users" (lower(btrim("name")))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_seguridad_users_email_normalized" ON "seguridad"."users" (lower(btrim("email")))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // The original casing is not restored: normalized values satisfy the old indexes too.
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_seguridad_users_email_normalized"`);
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_seguridad_users_name_normalized"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_email_normalized_active"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_name_normalized_active"`);

        await queryRunner.query(`ALTER TABLE "seguridad"."users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "seguridad"."users" ADD CONSTRAINT "UQ_51b8b26ac168fbe7d6f5653e6cf" UNIQUE ("name")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_active" ON "public"."users" ("email") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_name_active" ON "public"."users" ("name") WHERE "deleted_at" IS NULL`);
    }

    private async renameCollisions(queryRunner: QueryRunner, table: string, column: 'name' | 'email', scope: string): Promise<void> {
        const [schema, tableName] = table.split('.');
        const normalized = `lower(btrim("${column}"))`;
        // Email keeps a valid shape: the suffix goes into the local part (juan+dup2@x.com).
        const renamed = column === 'email'
            ? `regexp_replace(${normalized}, '@', '+dup' || ranked.rn || '@')`
            : `${normalized} || '-dup' || ranked.rn`;
        const result = await queryRunner.query(
            `WITH ranked AS (
                SELECT "id", row_number() OVER (PARTITION BY ${normalized} ORDER BY "created_at" NULLS LAST, "id") AS rn
                FROM "${schema}"."${tableName}" WHERE ${scope}
            )
            UPDATE "${schema}"."${tableName}" t SET "${column}" = ${renamed}
            FROM ranked WHERE ranked."id" = t."id" AND ranked.rn > 1
            RETURNING t."id", t."${column}" AS "after"`,
        );
        // The postgres driver returns [rows, affected] for UPDATE ... RETURNING.
        const rows: Array<{ id: string; after: string }> = Array.isArray(result?.[0]) ? result[0] : result;
        for (const row of rows) {
            console.warn(`NormalizeUserIdentities: ${table}.${column} of ${row.id} renamed to ${row.after}`);
        }
    }
}
