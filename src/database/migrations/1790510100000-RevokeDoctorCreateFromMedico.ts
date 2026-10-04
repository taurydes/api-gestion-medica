import { MigrationInterface, QueryRunner } from "typeorm";

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

// doctors.crear let a doctor register doctor profiles (POST /doctors); the UI creates doctors through POST /users, which medico cannot call.
export class RevokeDoctorCreateFromMedico1790510100000 implements MigrationInterface {
    name = 'RevokeDoctorCreateFromMedico1790510100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Soft delete like the permissions screen does; a database without the role or the grant is left as is.
        await queryRunner.query(
            `UPDATE "seguridad"."permisos_menus" pm
             SET "deleted_at" = now(), "activo" = false, "updated_at" = now()
             FROM "seguridad"."roles" r, "seguridad"."menu" m, "seguridad"."permisos" p
             WHERE pm."rol_id" = r."id" AND pm."menu_id" = m."id" AND pm."permiso_id" = p."id"
               AND r."nombre" = 'medico' AND m."slug" = 'doctors' AND p."nombre" = 'crear'
               AND pm."deleted_at" IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO "seguridad"."permisos_menus" ("permiso_id", "menu_id", "rol_id", "user_id", "activo")
             SELECT p."id", m."id", r."id", $1, true
             FROM "seguridad"."menu" m
             CROSS JOIN "seguridad"."permisos" p
             CROSS JOIN "seguridad"."roles" r
             WHERE m."slug" = 'doctors' AND m."deleted_at" IS NULL
               AND p."nombre" = 'crear' AND p."deleted_at" IS NULL
               AND r."nombre" = 'medico' AND r."deleted_at" IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM "seguridad"."permisos_menus" pm
                   WHERE pm."rol_id" = r."id" AND pm."menu_id" = m."id" AND pm."permiso_id" = p."id" AND pm."deleted_at" IS NULL
               )`,
            [SYSTEM_ACTOR],
        );
    }
}
