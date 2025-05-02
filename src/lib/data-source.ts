import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

dotenv.config({
  path: '.env'
});

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: process.env['POSTGRES_PORT'] ? +process.env['POSTGRES_PORT'] : 5432,
  username: process.env['POSTGRES_USERNAME'],
  password: process.env['POSTGRES_PASSWORD'],
  database: process.env['BITES_DB'] || 'db_bot_bites',
  synchronize: process.env.NODE_ENV === 'development',
  logging: false,
  entities: ['dist/lib/db/entity/**/*.js'],
  migrations: ['dist/lib/db/migrations/**/*.js'],
  subscribers: [],
});
