import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import * as User from './User.js';

@Entity('links')
export class Link {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 1000, nullable: true })
  link!: string;

  @Column({ nullable: false })
  sent: boolean = false;

  @Column({ nullable: true })
  sentAt!: Date;

  @ManyToOne(() => User.User, (user) => user.links)
  @JoinColumn({ name: "userId" })
  user: User.User | undefined;

  @Column()
  userId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}