import { MigrationInterface, QueryRunner } from "typeorm";

const MENU_ID = 'c0e0e5a1-0000-4000-8000-000000000028';
const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

// CommonPersonController requires common-person.{acción}, but the menu was never seeded: /common-persons was 403 for everyone (M-28).
export class SeedCommonPersonMenu1790400000000 implements MigrationInterface {
    name = 'SeedCommonPersonMenu1790400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Idempotent: skips the menu if the slug exists and each grant if a live row exists (a fresh empty DB gets only the menu).
        await queryRunner.query(
            `INSERT INTO "seguridad"."menu" ("id", "nombre", "slug", "menu_id", "url", "icono", "orden", "es_titulo", "es_visible", "status", "user_id")
             SELECT $1, 'Personas', 'common-person', NULL, '#', 'fa-id-card', 27, false, false, true, $2
             WHERE NOT EXISTS (SELECT 1 FROM "seguridad"."menu" WHERE "slug" = 'common-person')`,
            [MENU_ID, SYSTEM_ACTOR],
        );
        await queryRunner.query(
            `INSERT INTO "seguridad"."permisos_menus" ("permiso_id", "menu_id", "rol_id", "user_id", "activo")
             SELECT p."id", m."id", r."id", $1, true
             FROM "seguridad"."menu" m
             CROSS JOIN "seguridad"."permisos" p
             CROSS JOIN "seguridad"."roles" r
             WHERE m."slug" = 'common-person' AND m."deleted_at" IS NULL
               AND p."nombre" IN ('crear', 'consultar', 'actualizar', 'eliminar') AND p."deleted_at" IS NULL
               AND r."nombre" = 'superusuario' AND r."deleted_at" IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM "seguridad"."permisos_menus" pm
                   WHERE pm."rol_id" = r."id" AND pm."menu_id" = m."id" AND pm."permiso_id" = p."id" AND pm."deleted_at" IS NULL
               )`,
            [SYSTEM_ACTOR],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Removes only the menu this migration created (fixed id) and every grant on it (the FK requires it).
        await queryRunner.query(`DELETE FROM "seguridad"."permisos_menus" WHERE "menu_id" = $1`, [MENU_ID]);
        await queryRunner.query(`DELETE FROM "seguridad"."menu" WHERE "id" = $1`, [MENU_ID]);
    }
}
