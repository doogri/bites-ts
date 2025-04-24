import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

dotenv.config({
  path: '.env'
});

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  database: 'db_bot_bites',
  synchronize: process.env.NODE_ENV === 'development',
  logging: false,
  entities: ['dist/lib/db/entity/**/*.js'],
  migrations: ['dist/lib/db/migrations/**/*.js'],
  subscribers: [],
});
