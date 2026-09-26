import { MigrationInterface, QueryRunner } from "typeorm";

export class SingleUserPersonLink1790386160686 implements MigrationInterface {
    name = 'SingleUserPersonLink1790386160686'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // users.common_person_id is the owning side; refuse to drop persona_comun.user_id if the two disagree.
        const [{ divergent }] = await queryRunner.query(
            `SELECT count(*)::int AS divergent FROM "persona_comun" p JOIN "users" u ON u."id" = p."user_id" WHERE u."common_person_id" IS DISTINCT FROM p."id"`,
        );
        if (divergent > 0) {
            throw new Error(`${divergent} user/person link(s) diverge between users.common_person_id and persona_comun.user_id; reconcile them first.`);
        }
        // Moves data: fills the owning side when only persona_comun.user_id had the link (0 rows on 2026-09-25).
        await queryRunner.query(`UPDATE "users" u SET "common_person_id" = p."id" FROM "persona_comun" p WHERE p."user_id" = u."id" AND u."common_person_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "persona_comun" DROP CONSTRAINT "FK_64ad633807ee33a92952c382bc5"`);
        await queryRunner.query(`ALTER TABLE "persona_comun" DROP CONSTRAINT "UQ_64ad633807ee33a92952c382bc5"`);
        await queryRunner.query(`ALTER TABLE "persona_comun" DROP COLUMN "user_id"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persona_comun" ADD "user_id" uuid`);
        await queryRunner.query(`UPDATE "persona_comun" p SET "user_id" = u."id" FROM "users" u WHERE u."common_person_id" = p."id"`);
        await queryRunner.query(`ALTER TABLE "persona_comun" ADD CONSTRAINT "UQ_64ad633807ee33a92952c382bc5" UNIQUE ("user_id")`);
        await queryRunner.query(`ALTER TABLE "persona_comun" ADD CONSTRAINT "FK_64ad633807ee33a92952c382bc5" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
