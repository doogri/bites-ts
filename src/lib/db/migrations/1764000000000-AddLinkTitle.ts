import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkTitle1764000000000 implements MigrationInterface {
    name = 'AddLinkTitle1764000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "links" ADD "title" character varying(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "links" DROP COLUMN "title"`);
    }
}
