import { MigrationInterface, QueryRunner } from "typeorm";

export class AddItemDiscount1746576002000 implements MigrationInterface {
    name = 'AddItemDiscount1746576002000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_items" ADD "discount" numeric(10,2) NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoice_items" DROP COLUMN "discount"`);
    }
}
