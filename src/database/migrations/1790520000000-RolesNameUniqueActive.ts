import { MigrationInterface, QueryRunner } from "typeorm";

// Roles are soft-deleted now (MJ-07): only live roles compete for a name.
export class RolesNameUniqueActive1790520000000 implements MigrationInterface {
    name = 'RolesNameUniqueActive1790520000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_roles_nombre"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_roles_nombre_active" ON "seguridad"."roles" ("nombre") WHERE "deleted_at" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Fails if a deleted role shares its name with a live one; rename one of them first.
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_roles_nombre_active"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_roles_nombre" ON "seguridad"."roles" ("nombre")`);
    }
}
