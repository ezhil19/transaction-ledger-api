import { config } from 'dotenv';

// e2e tests always run against the separate test database, never the dev one.
config();
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'ledger_test';
