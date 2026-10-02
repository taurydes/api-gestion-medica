import { MigrationInterface, QueryRunner } from "typeorm";

// archivo_ruta held http://host:port/<uploads>/client-…/file, a URL nothing serves; it now holds the path inside uploads.
export class VideoRelativePath1790500100000 implements MigrationInterface {
    name = 'VideoRelativePath1790500100000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "parametro"."video_publicidad" SET "archivo_ruta" = regexp_replace("archivo_ruta", '^https?://[^/]+/(\./)?[^/]+/', '') WHERE "archivo_ruta" ~ '^https?://'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // The original host is not recoverable; the default deployment's is used
        await queryRunner.query(
            `UPDATE "parametro"."video_publicidad" SET "archivo_ruta" = 'http://localhost:8008/./uploads/' || "archivo_ruta" WHERE "archivo_ruta" !~ '^https?://'`,
        );
    }

}
