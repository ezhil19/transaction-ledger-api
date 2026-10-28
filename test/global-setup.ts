import { readFileSync } from 'fs';
import knex from 'knex';
import * as path from 'path';
import './env';

/** Rebuilds the test schema from database/schema.sql before the suite runs. */
export default async function globalSetup(): Promise<void> {
  const db = knex({
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
    },
  });
  try {
    // Dropping the tables also drops their triggers. Only ever runs against the test database.
    await db.raw('DROP TABLE IF EXISTS transactions, accounts, users');
    await db.raw(readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  } finally {
    await db.destroy();
  }
}
