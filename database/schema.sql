-- Transaction Ledger schema (MySQL 8.0.16+).
-- Run it against the database named in DB_NAME, e.g. in MySQL Workbench or:
--   mysql -u <user> -p ledger < database/schema.sql
-- Safe to re-run: tables are only created if missing, and the triggers hold no data.

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT uq_users_email UNIQUE (email)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
  id         CHAR(36)      NOT NULL,
  user_id    CHAR(36)      NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  balance    DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_accounts_balance_non_negative CHECK (balance >= 0)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id            CHAR(36)                 NOT NULL,
  account_id    CHAR(36)                 NOT NULL,
  type          ENUM('credit', 'debit')  NOT NULL,
  amount        DECIMAL(18,2)            NOT NULL,
  description   VARCHAR(500)             NULL,
  -- Binary collation: reference ids are exact, so 'INV-1' and 'inv-1' are different references.
  reference_id  VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
  balance_after DECIMAL(18,2)            NOT NULL,
  transfer_id   CHAR(36)                 NULL,
  created_at    DATETIME(6)              NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT fk_transactions_account FOREIGN KEY (account_id)
    REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT uq_transactions_account_reference UNIQUE (account_id, reference_id),
  CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0),
  INDEX idx_transactions_account_created (account_id, created_at),
  INDEX idx_transactions_account_type_created (account_id, type, created_at),
  INDEX idx_transactions_transfer (transfer_id)
) ENGINE = InnoDB;

-- Transactions are an append-only ledger: block edits and deletes at the database level too.
DROP TRIGGER IF EXISTS trg_transactions_no_update;
CREATE TRIGGER trg_transactions_no_update BEFORE UPDATE ON transactions
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transactions are immutable';

DROP TRIGGER IF EXISTS trg_transactions_no_delete;
CREATE TRIGGER trg_transactions_no_delete BEFORE DELETE ON transactions
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transactions are immutable';
