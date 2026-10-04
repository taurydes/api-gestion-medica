import { MigrationInterface, QueryRunner } from "typeorm";

// MJ-23: a screening system needs the patient's age and sex; both stay nullable for existing people.
export class PersonBirthDateAndSex1790520500000 implements MigrationInterface {
    name = 'PersonBirthDateAndSex1790520500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."persona_comun" ADD "fecha_nacimiento" date`);
        await queryRunner.query(`ALTER TABLE "public"."persona_comun" ADD "sexo" character varying(1)`);
        await queryRunner.query(`ALTER TABLE "public"."persona_comun" ADD CONSTRAINT "CHK_persona_comun_sexo" CHECK ("sexo" IN ('F', 'M'))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "public"."persona_comun" DROP CONSTRAINT "CHK_persona_comun_sexo"`);
        await queryRunner.query(`ALTER TABLE "public"."persona_comun" DROP COLUMN "sexo"`);
        await queryRunner.query(`ALTER TABLE "public"."persona_comun" DROP COLUMN "fecha_nacimiento"`);
    }
}
