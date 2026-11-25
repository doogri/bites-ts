import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkRecommended1764100000000 implements MigrationInterface {
    name = 'AddLinkRecommended1764100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "links" ADD "recommended" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "links" DROP COLUMN "recommended"`);
    }
}
