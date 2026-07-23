import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInvoiceChecked1746576001000 implements MigrationInterface {
    name = 'AddInvoiceChecked1746576001000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" ADD "checked" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "checked"`);
    }
}
