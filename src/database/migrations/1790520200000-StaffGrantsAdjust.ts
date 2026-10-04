import { MigrationInterface, QueryRunner } from "typeorm";

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

// MJ-04: own profile goes through /auth/*, so medico and enfermero lose user.* (list and edit other users).
const REVOKED: Array<[role: string, menu: string, action: string]> = [
    ['medico', 'user', 'consultar'],
    ['medico', 'user', 'actualizar'],
    ['enfermero', 'user', 'actualizar'],
];
// MJ-47: enfermero registers patients, whose form reads the allergy, disease and medication catalogs.
const GRANTED: Array<[role: string, menu: string, action: string]> = [
    ['enfermero', 'parameters', 'consultar'],
];

export class StaffGrantsAdjust1790520200000 implements MigrationInterface {
    name = 'StaffGrantsAdjust1790520200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const grant of REVOKED) await revoke(queryRunner, grant);
        for (const grant of GRANTED) await grantTo(queryRunner, grant);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const grant of GRANTED) await revoke(queryRunner, grant);
        for (const grant of REVOKED) await grantTo(queryRunner, grant);
    }
}

// Soft delete like the permissions screen; a database without the role, menu or grant is left as is.
async function revoke(queryRunner: QueryRunner, [role, menu, action]: [string, string, string]): Promise<void> {
    await queryRunner.query(
        `UPDATE "seguridad"."permisos_menus" pm
         SET "deleted_at" = now(), "activo" = false, "updated_at" = now()
         FROM "seguridad"."roles" r, "seguridad"."menu" m, "seguridad"."permisos" p
         WHERE pm."rol_id" = r."id" AND pm."menu_id" = m."id" AND pm."permiso_id" = p."id"
           AND r."nombre" = $1 AND m."slug" = $2 AND p."nombre" = $3
           AND pm."deleted_at" IS NULL`,
        [role, menu, action],
    );
}

async function grantTo(queryRunner: QueryRunner, [role, menu, action]: [string, string, string]): Promise<void> {
    await queryRunner.query(
        `INSERT INTO "seguridad"."permisos_menus" ("permiso_id", "menu_id", "rol_id", "user_id", "activo")
         SELECT p."id", m."id", r."id", $4, true
         FROM "seguridad"."menu" m
         CROSS JOIN "seguridad"."permisos" p
         CROSS JOIN "seguridad"."roles" r
         WHERE m."slug" = $2 AND m."deleted_at" IS NULL
           AND p."nombre" = $3 AND p."deleted_at" IS NULL
           AND r."nombre" = $1 AND r."deleted_at" IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM "seguridad"."permisos_menus" pm
               WHERE pm."rol_id" = r."id" AND pm."menu_id" = m."id" AND pm."permiso_id" = p."id" AND pm."deleted_at" IS NULL
           )`,
        [role, menu, action, SYSTEM_ACTOR],
    );
}
