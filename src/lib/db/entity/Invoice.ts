import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { InvoiceItem } from './InvoiceItem.js';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  externalId!: string;

  @Column()
  storeName!: string;

  @Column()
  invoiceDate!: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total!: number;

  @Column()
  sourceUrl!: string;

  @Column({ default: false })
  classified!: boolean;

  @OneToMany(() => InvoiceItem, (item) => item.invoice)
  items!: InvoiceItem[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
