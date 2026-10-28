-- Runs once when the MySQL container is first created: a separate database for e2e tests.
CREATE DATABASE IF NOT EXISTS ledger_test;
GRANT ALL PRIVILEGES ON ledger_test.* TO 'ledger'@'%';
FLUSH PRIVILEGES;
