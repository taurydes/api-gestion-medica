import { MigrationInterface, QueryRunner } from "typeorm";

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

// Sidebar visibility becomes its own grant (`<slug>.module`): a CRUD read no longer puts a menu in the sidebar.
// superusuario sees every menu; the clinical roles see their modules plus the parent groups that hold them.
const ROLE_MODULES: Record<string, string[]> = {
    medico: [
        'menu', 'medical-center', 'departments', 'patient', 'appointments', 'recipe',
        'medical-history', 'mammography-analysis', 'machine-learning', 'profile',
    ],
    enfermero: ['menu', 'medical-center', 'patient', 'profile'],
};

export class MenuModulePermission1790521100000 implements MigrationInterface {
    name = 'MenuModulePermission1790521100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO "seguridad"."permisos" ("nombre", "nombre_mostrar", "user_id", "activo", "orden", "requerido")
             SELECT 'module', 'Ver módulo en el menú', $1, true, 5, false
             WHERE NOT EXISTS (SELECT 1 FROM "seguridad"."permisos" WHERE "nombre" = 'module' AND "deleted_at" IS NULL)`,
            [SYSTEM_ACTOR],
        );
        await grant(queryRunner, `r."nombre" = 'superusuario'`, []);
        for (const [role, slugs] of Object.entries(ROLE_MODULES)) {
            await grant(queryRunner, `r."nombre" = $2 AND m."slug" = ANY($3)`, [role, slugs]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Every module grant goes with the action, including those an admin added after this migration.
        await queryRunner.query(
            `DELETE FROM "seguridad"."permisos_menus"
             WHERE "permiso_id" IN (SELECT "id" FROM "seguridad"."permisos" WHERE "nombre" = 'module')`,
        );
        await queryRunner.query(`DELETE FROM "seguridad"."permisos" WHERE "nombre" = 'module'`);
    }
}

async function grant(queryRunner: QueryRunner, filter: string, params: unknown[]): Promise<void> {
    await queryRunner.query(
        `INSERT INTO "seguridad"."permisos_menus" ("permiso_id", "menu_id", "rol_id", "user_id", "activo")
         SELECT p."id", m."id", r."id", $1, true
         FROM "seguridad"."menu" m
         CROSS JOIN "seguridad"."permisos" p
         CROSS JOIN "seguridad"."roles" r
         WHERE p."nombre" = 'module' AND p."deleted_at" IS NULL
           AND m."deleted_at" IS NULL AND r."deleted_at" IS NULL
           AND ${filter}
           AND NOT EXISTS (
               SELECT 1 FROM "seguridad"."permisos_menus" pm
               WHERE pm."rol_id" = r."id" AND pm."menu_id" = m."id" AND pm."permiso_id" = p."id" AND pm."deleted_at" IS NULL
           )`,
        [SYSTEM_ACTOR, ...params],
    );
}
