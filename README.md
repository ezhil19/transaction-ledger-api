# Transaction Ledger API

A backend API for a simple transaction ledger: create accounts, post credit and debit
transactions, read balances and paginated history, and transfer money between accounts.
Users register and log in, and each user can only see and use their own accounts.

**Stack:** Node.js · TypeScript · NestJS 10 · Knex · MySQL 8 · Swagger (OpenAPI) · Jest + Supertest

- Full endpoint reference: [docs/API.md](docs/API.md)
- Interactive docs (when running): http://localhost:3000/api/docs
- OpenAPI JSON: [docs/openapi.json](docs/openapi.json), also served at `/api/docs-json`

---

## Running locally

### Prerequisites

- Node.js 20 or later, and Yarn 1 (`npm i -g yarn`)
- Docker Desktop, for MySQL. To use your own MySQL 8.0.16+ instead, see
  [Using your own MySQL](#using-your-own-mysql).

### Steps

```bash
yarn install
cp .env.example .env            # defaults match docker-compose.yml
docker compose up -d --wait     # MySQL 8 on localhost:3307: creates `ledger` + `ledger_test`
                                # and loads database/schema.sql into `ledger`
yarn start:dev                  # http://localhost:3000, docs at /api/docs
```

### Trying it out

Every endpoint except register and login needs a token. In Swagger (http://localhost:3000/api/docs):

1. **Auth → `POST /auth/register`** with an email and a password (at least 8 characters).
2. **Auth → `POST /auth/login`** with the same details, and copy `access_token` from the response.
3. Click **Authorize** (top right), paste the token, and click Authorize. Every request now sends it.

With curl or Postman, send the header `Authorization: Bearer <access_token>`. Tokens last
`JWT_EXPIRES_IN` seconds (1 hour by default).

The schema (tables, constraints and immutability triggers) lives in one plain SQL file,
[database/schema.sql](database/schema.sql). The container only loads it on its very first start.
To recreate the database from scratch, run `docker compose down -v` and then `docker compose up -d --wait`.

### Using your own MySQL

1. Create the databases, e.g. in MySQL Workbench as `root`:
   ```sql
   CREATE DATABASE ledger;
   CREATE DATABASE ledger_test;  -- only needed for the tests
   ```
2. Open [database/schema.sql](database/schema.sql) and run it against `ledger`, or run
   `mysql -u <user> -p ledger < database/schema.sql`. It's safe to run again later.
3. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` in `.env`. Set `JWT_SECRET`
   to a long random value too.

The schema creates triggers. If binary logging is on (the default in MySQL 8) and the user isn't
`root`, MySQL may refuse with error 1419. Run `SET PERSIST log_bin_trust_function_creators = 1;`
once as `root` to allow it.

### Tests

```bash
yarn test:e2e
```

The e2e suite runs against the separate `ledger_test` database. Before each run it drops that
database's tables and reloads `database/schema.sql`, so your dev data is never touched. It covers
every rule in the brief: the balance-consistency example, overdraft rejection, duplicate
`reference_id`s, pagination, sorting and filtering, validation errors, immutability, transfer
rollback, and concurrency (parallel debits, racing duplicates, opposite-direction transfers). It
also covers registration, login, missing or invalid tokens, and one user trying to read or move
another user's money.

### Scripts

| Script | What it does |
|---|---|
| `yarn start:dev` | Run with watch mode |
| `yarn build` then `yarn start:prod` | Compile to `dist/` and run the build |
| `yarn test:e2e` | Run the end-to-end tests |

---

## Project structure

```
src/
  main.ts                  # bootstrap
  setup-app.ts             # JSON parser, validation pipe, error filter, Swagger (shared with tests)
  app.module.ts
  database/                # Knex provider (global, injected via the KNEX token)
  auth/                    # register/login, global JWT guard, @Public / @CurrentUser, scrypt hashing
  common/
    errors/                # AppException + one subclass per error case
    filters/               # AllExceptionsFilter → one consistent error format
    dto/                   # shared Swagger DTOs (error response)
    validation.ts          # ValidationPipe config, account-id pipe
    money.ts               # decimal formatting helpers
  accounts/                # POST /accounts, GET /accounts/:id, GET /accounts/:id/balance
  transactions/            # POST + GET /accounts/:id/transactions (core ledger logic)
  transfers/               # POST /transfers (bonus)
database/
  schema.sql               # users, accounts, transactions: constraints and immutability triggers
  init/                    # creates the test database on first container start
test/                      # e2e tests
docs/                      # API reference + OpenAPI JSON
```

Each feature is a NestJS module with its own controller, service and DTOs. Controllers only
handle HTTP and Swagger. The business rules live in the services.

---

## How data integrity is guaranteed

| Requirement | How |
|---|---|
| **Atomicity** | Each write runs inside one `knex.transaction()`: insert the transaction row, then update the balance. Any error rolls back both. |
| **No races / lost updates** | The account row is locked with `SELECT … FOR UPDATE` before reading the balance, so concurrent writes to one account are serialised. |
| **Balance consistency** | Each transaction stores `balance_after`. Money is `DECIMAL(18,2)` in MySQL, and arithmetic uses `decimal.js`, never JS floats. |
| **No overdraft** | Checked in code (422 `INSUFFICIENT_BALANCE`), and by the DB constraint `CHECK (balance >= 0)` as a last line of defence. |
| **Duplicate protection** | Checked in code after taking the lock (409 `DUPLICATE_TRANSACTION`), and by `UNIQUE (account_id, reference_id)`. A `ER_DUP_ENTRY` from the index is also mapped to 409. |
| **Positive amounts** | DTO validation, plus `CHECK (amount > 0)`. |
| **Valid account** | Foreign key `transactions.account_id → accounts.id` (`ON DELETE RESTRICT`). |
| **Immutability** | The API has no update/delete routes for transactions, and `BEFORE UPDATE` / `BEFORE DELETE` triggers reject any change at the database level. |
| **Client can't set balance** | The validation pipe uses `forbidNonWhitelisted`: sending `balance` returns 400. The value comes from the column default. |
| **Transfers** | Both legs are written in one DB transaction. Both rows are locked in a fixed (id) order to avoid deadlocks. Any failure rolls back the whole transfer. |
| **Ownership** | Every account query is filtered by the caller's `user_id`, including the locked read inside a write. `accounts.user_id` is a foreign key to `users.id`, and `UNIQUE (email)` prevents duplicate sign-ups. |

---

## Error format

Every error, including validation, 404 and 500, has the same shape:

```json
{
  "statusCode": 422,
  "error": "INSUFFICIENT_BALANCE",
  "message": "Insufficient balance: available 100.00, requested 150.00",
  "details": { "account_id": "…", "balance": "100.00", "requested_amount": "150.00" },
  "path": "/accounts/…/transactions",
  "timestamp": "2026-10-27T10:15:30.123Z"
}
```

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body or query (bad type, amount, reference_id, page, limit, unknown fields). `details` lists each field and its errors. |
| 400 | `INVALID_REQUEST_BODY` | Body is not valid JSON |
| 400 | `INVALID_ACCOUNT_ID` | Account id in the URL is not a UUID |
| 400 | `INVALID_TRANSFER` | Transfer source and destination are the same |
| 401 | `UNAUTHORIZED` | Missing, malformed, invalid or expired Bearer token |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password at login (the same message for both) |
| 404 | `ACCOUNT_NOT_FOUND` | Account does not exist, or belongs to another user |
| 404 | `ROUTE_NOT_FOUND` | Unknown route or method (e.g. `DELETE` on a transaction) |
| 409 | `DUPLICATE_TRANSACTION` | `reference_id` already used on this account. `details.existing_transaction` holds the original if it's on your account. |
| 409 | `EMAIL_ALREADY_REGISTERED` | Registering an email that already has a user |
| 413 | `PAYLOAD_TOO_LARGE` | Request body over 100 KB |
| 422 | `INSUFFICIENT_BALANCE` | A debit or transfer would make the balance negative |
| 500 | `INTERNAL_ERROR` | Unexpected error (details are logged, not returned) |

---

## Assumptions

1. **IDs are UUIDs, generated by the server** (UUIDv7, which is time-ordered). Clients never supply an account or transaction id.
2. **Money has 2 decimal places, single currency.** Requests send `amount` as a JSON number with at most 2 decimals. Responses return money as strings (`"150.00"`) so no precision is lost in JSON or JS clients. Maximum amount: `9,999,999,999,999.99`.
3. **`description` is optional** (max 500 chars). `reference_id` is required, trimmed, at most 100 chars, and **case-sensitive**: `INV-1` and `inv-1` are different references.
4. **A duplicate returns `409 Conflict`**, with the original transaction in `details.existing_transaction`. Nothing is written and the balance doesn't change. The duplicate check runs before the balance check, so retrying an already-applied debit reports "duplicate", not "insufficient balance". A duplicate is detected by `reference_id` alone, even if the amount or type differ.
5. **Rejected transactions are not stored.** A debit refused for insufficient balance returns 422 and leaves no record. The ledger only holds valid, applied entries.
6. **Pagination:** `page` defaults to 1 and `limit` to 10, with a maximum of 100. Non-integers or out-of-range values return 400. A page beyond the last returns an empty `data` array with correct metadata, not an error.
7. **Sorting:** latest first by `created_at` (microsecond precision). Ties are broken by id, which is time-ordered.
8. **Transfers** use the request's `reference_id` for both legs, so it must be unused on both accounts. Both legs share a `transfer_id` and appear in each account's history. Transferring to the same account is rejected. If no `description` is given, one is generated ("Transfer to/from account …").
9. **Authentication and authorisation (added beyond the brief).** Users register with an email and password (hashed with scrypt) and log in for a JWT that lasts 1 hour, with no refresh tokens. Every account belongs to the user who created it, and only that user can read it, post to it, or transfer out of it. Another user's account returns the same 404 as a missing one, so account ids can't be probed. A transfer can go *to* any account. When the destination belongs to someone else, the response's `credit` leg is `null` and a duplicate-reference 409 leaves out their transaction, so the sender never sees the recipient's balance or history. Emails are case-insensitive.
10. **Timestamps are UTC**, returned as ISO 8601 strings.
11. An extra `GET /accounts/:id` endpoint returns the full account. Each transaction also exposes `balance_after` and `transfer_id`, for auditing.
