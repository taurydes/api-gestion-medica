import { MigrationInterface, QueryRunner } from "typeorm";

export class PermisosMenusUniqueGrant1790386000000 implements MigrationInterface {
    name = 'PermisosMenusUniqueGrant1790386000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_permisos_menus_rol_menu_permiso_active" ON "seguridad"."permisos_menus" ("rol_id", "menu_id", "permiso_id") WHERE "deleted_at" IS NULL`);
        // The helper skipped only rows with the same user_id; with the index it must skip any active grant.
        await queryRunner.query(ASIGNAR_SUPER_PERMISOS.replace('/*GRANT_FILTER*/', 'AND pm.deleted_at IS NULL'));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(ASIGNAR_SUPER_PERMISOS.replace('/*GRANT_FILTER*/', 'AND pm.user_id = v_user_id'));
        await queryRunner.query(`DROP INDEX "seguridad"."UQ_permisos_menus_rol_menu_permiso_active"`);
    }
}

const ASIGNAR_SUPER_PERMISOS = `CREATE OR REPLACE FUNCTION seguridad.asignar_super_permisos(p_role_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_role_id UUID;
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    IF p_user_id IS NOT NULL THEN
        SELECT role_id, id INTO v_role_id, v_user_id
        FROM seguridad.users
        WHERE id = p_user_id;

        IF v_role_id IS NULL THEN
            RETURN 'Error: Usuario no encontrado o no tiene rol asignado.';
        END IF;
    ELSE
        v_role_id := p_role_id;
        v_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    IF v_role_id IS NULL THEN
        RETURN 'Error: Debe proporcionar al menos un roleId o userId.';
    END IF;

    INSERT INTO seguridad.permisos_menus (menu_id, permiso_id, rol_id, user_id, activo, created_at)
    SELECT m.id, p.id, v_role_id, v_user_id, true, NOW()
    FROM seguridad.menu m
    CROSS JOIN seguridad.permisos p
    WHERE m.status = true
      AND p.activo = true
      AND NOT EXISTS (
          SELECT 1 FROM seguridad.permisos_menus pm
          WHERE pm.menu_id = m.id
            AND pm.permiso_id = p.id
            AND pm.rol_id = v_role_id
            /*GRANT_FILTER*/
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN 'Éxito: Se asignaron ' || v_count || ' combinaciones de permisos/menús.';
END;
$function$`;
