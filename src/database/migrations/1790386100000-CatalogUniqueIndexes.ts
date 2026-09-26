import { MigrationInterface, QueryRunner } from "typeorm";

// Written by hand: migration:generate crashes on public.users vs seguridad.users (same table name).
export class CatalogUniqueIndexes1790386100000 implements MigrationInterface {
    name = 'CatalogUniqueIndexes1790386100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_medical_centers_name_active" ON "parametro"."medical_centers" ("name") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_departments_name_center_active" ON "parametro"."departments" ("name", "medical_center_id") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_roles_nombre" ON "seguridad"."roles" ("nombre")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_menu_slug" ON "seguridad"."menu" ("slug")`);
        await queryRunner.query(`ALTER TABLE "public"."users" DROP CONSTRAINT "UQ_51b8b26ac168fbe7d6f5653e6cf"`);
        await queryRunner.query(`ALTER TABLE "public"."users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_name_active" ON "public"."users" ("name") WHERE "deleted_at" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_active" ON "public"."users" ("email") WHERE "deleted_at" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_users_email_active"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_users_name_active"`);
        await queryRunner.query(`ALTER TABLE "public"."users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "public"."users" ADD CONSTRAINT "UQ_51b8b26ac168fbe7d6f5653e6cf" UNIQUE ("name")`);
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_menu_slug"`);
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_roles_nombre"`);
        await queryRunner.query(`DROP INDEX "parametro"."UQ_departments_name_center_active"`);
        await queryRunner.query(`DROP INDEX "parametro"."UQ_medical_centers_name_active"`);
    }
}
