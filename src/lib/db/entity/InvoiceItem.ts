import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import * as InvoiceModule from './Invoice.js';

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount!: number;

  @Column({ type: 'float', default: 1 })
  quantity!: number;

  @Column({ default: 'unknown' })
  usage!: string;

  @ManyToOne(() => InvoiceModule.Invoice, (invoice) => invoice.items)
  @JoinColumn({ name: 'invoiceId' })
  invoice: InvoiceModule.Invoice | undefined;

  @Column()
  invoiceId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
