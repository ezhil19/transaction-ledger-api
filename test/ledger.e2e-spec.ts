import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Knex } from 'knex';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { KNEX } from '../src/database/database.module';
import { appOptions, setupApp } from '../src/setup-app';

const PASSWORD = 'correct-horse-battery';

describe('Transaction Ledger API (e2e)', () => {
  let app: INestApplication;
  /** Unauthenticated client. */
  let http: ReturnType<typeof request>;
  /** Client logged in as the default test user, used by most tests. */
  let api: Client;
  let ref = 0;
  const nextRef = () => `REF-${Date.now()}-${++ref}`;
  const nextEmail = () => `user-${Date.now()}-${++ref}@example.com`;

  /** Sends every request with `Authorization: Bearer <token>`. */
  const clientFor = (token: string) => {
    const auth = { Authorization: `Bearer ${token}` };
    return {
      get: (url: string) => http.get(url).set(auth),
      post: (url: string) => http.post(url).set(auth),
      delete: (url: string) => http.delete(url).set(auth),
    };
  };
  type Client = ReturnType<typeof clientFor>;

  /** Registers a new user and returns a client logged in as them. */
  const signUp = async (email = nextEmail()) => {
    await http.post('/auth/register').send({ email, password: PASSWORD }).expect(201);
    const res = await http.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    return clientFor(res.body.access_token);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(appOptions);
    setupApp(app);
    // Listen once on a random port, instead of supertest opening a listener per request
    await app.listen(0);
    http = request(await app.getUrl());
    api = await signUp();
  });

  afterAll(async () => {
    await app.close();
  });

  const createAccount = async (name = 'Test User', client = api) => {
    const res = await client.post('/accounts').send({ name }).expect(201);
    return res.body.id as string;
  };

  const post = (
    accountId: string,
    type: 'credit' | 'debit',
    amount: number,
    reference_id = nextRef(),
    client = api,
  ) => client.post(`/accounts/${accountId}/transactions`).send({ type, amount, reference_id });

  const balanceOf = async (accountId: string, client = api) =>
    (await client.get(`/accounts/${accountId}/balance`).expect(200)).body.balance as string;

  describe('accounts', () => {
    it('creates an account with balance 0 and a server-generated created_at', async () => {
      const res = await api.post('/accounts').send({ name: '  Alice  ' }).expect(201);
      expect(res.body).toMatchObject({ name: 'Alice', balance: '0.00' });
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(res.body.created_at).toString()).not.toBe('Invalid Date');
    });

    it('rejects a client-supplied balance', async () => {
      const res = await api.post('/accounts').send({ name: 'Bob', balance: 1000 }).expect(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual([
        { field: 'balance', errors: ['property balance should not exist'] },
      ]);
    });

    it.each([[{}], [{ name: '' }], [{ name: '   ' }], [{ name: 123 }]])(
      'rejects an invalid name %j',
      async (body) => {
        const res = await api.post('/accounts').send(body).expect(400);
        expect(res.body.error).toBe('VALIDATION_ERROR');
      },
    );

    it('returns a consistent error for malformed JSON', async () => {
      const res = await api
        .post('/accounts')
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'INVALID_REQUEST_BODY' });
    });

    it('returns 413 in the standard format for an oversized body', async () => {
      const res = await api
        .post('/accounts')
        .send({ name: 'a'.repeat(200_000) })
        .expect(413);
      expect(res.body).toMatchObject({ statusCode: 413, error: 'PAYLOAD_TOO_LARGE' });
    });

    it('returns balance, 404 for an unknown account, 400 for a malformed id', async () => {
      const id = await createAccount();
      expect((await api.get(`/accounts/${id}/balance`).expect(200)).body).toEqual({
        account_id: id,
        balance: '0.00',
      });

      const missing = await api
        .get('/accounts/00000000-0000-4000-8000-000000000000/balance')
        .expect(404);
      expect(missing.body.error).toBe('ACCOUNT_NOT_FOUND');

      const bad = await api.get('/accounts/not-a-uuid/balance').expect(400);
      expect(bad.body.error).toBe('INVALID_ACCOUNT_ID');
    });
  });

  describe('transactions', () => {
    it('keeps the balance equal to the sum of valid transactions (spec example)', async () => {
      const id = await createAccount();
      await post(id, 'credit', 100).expect(201);
      await post(id, 'credit', 50).expect(201);
      await post(id, 'debit', 30).expect(201);
      const last = await post(id, 'debit', 20).expect(201);
      expect(last.body.balance_after).toBe('100.00');
      expect(await balanceOf(id)).toBe('100.00');
    });

    it('rejects an overdraft and leaves the balance unchanged', async () => {
      const id = await createAccount();
      await post(id, 'credit', 100).expect(201);
      const res = await post(id, 'debit', 150).expect(422);
      expect(res.body).toMatchObject({ error: 'INSUFFICIENT_BALANCE' });
      expect(await balanceOf(id)).toBe('100.00');

      const history = await api.get(`/accounts/${id}/transactions`).expect(200);
      expect(history.body.pagination.total_records).toBe(1);
    });

    it('handles decimal amounts without float drift', async () => {
      const id = await createAccount();
      await post(id, 'credit', 0.1).expect(201);
      await post(id, 'credit', 0.2).expect(201);
      expect(await balanceOf(id)).toBe('0.30');
    });

    it('treats a repeated reference_id on the same account as a duplicate', async () => {
      const id = await createAccount();
      const first = await post(id, 'credit', 100, 'DUP-1').expect(201);
      const again = await post(id, 'credit', 100, 'DUP-1').expect(409);
      expect(again.body.error).toBe('DUPLICATE_TRANSACTION');
      expect(again.body.details.existing_transaction.id).toBe(first.body.id);
      expect(await balanceOf(id)).toBe('100.00');
    });

    it('allows the same reference_id on different accounts', async () => {
      const a = await createAccount();
      const b = await createAccount();
      await post(a, 'credit', 10, 'SHARED-REF').expect(201);
      await post(b, 'credit', 10, 'SHARED-REF').expect(201);
    });

    it('treats reference_id as case-sensitive', async () => {
      const id = await createAccount();
      await post(id, 'credit', 10, 'INV-1').expect(201);
      await post(id, 'credit', 10, 'inv-1').expect(201);
      expect(await balanceOf(id)).toBe('20.00');
    });

    it('returns 404 when the account does not exist', async () => {
      const res = await post('00000000-0000-4000-8000-000000000000', 'credit', 10).expect(404);
      expect(res.body.error).toBe('ACCOUNT_NOT_FOUND');
    });

    it.each([
      [{ type: 'refund', amount: 10, reference_id: 'X' }, 'type'],
      [{ type: 'credit', amount: 0, reference_id: 'X' }, 'amount'],
      [{ type: 'credit', amount: -5, reference_id: 'X' }, 'amount'],
      [{ type: 'credit', amount: 1.234, reference_id: 'X' }, 'amount'],
      [{ type: 'credit', amount: '10', reference_id: 'X' }, 'amount'],
      [{ type: 'credit', amount: 10 }, 'reference_id'],
      [{ type: 'credit', amount: 10, reference_id: '  ' }, 'reference_id'],
    ])('rejects invalid body %j (field %s)', async (body, field) => {
      const id = await createAccount();
      const res = await api.post(`/accounts/${id}/transactions`).send(body).expect(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('never lets concurrent debits overdraw the account', async () => {
      const id = await createAccount();
      await post(id, 'credit', 100).expect(201);
      const results = await Promise.all(Array.from({ length: 10 }, () => post(id, 'debit', 30)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 422)).toHaveLength(7);
      expect(await balanceOf(id)).toBe('10.00');
    });

    it('creates exactly one transaction when the same request races itself', async () => {
      const id = await createAccount();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => post(id, 'credit', 25, 'RACE-REF')),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await balanceOf(id)).toBe('25.00');
    });

    it('blocks edits and deletes at the database level', async () => {
      const id = await createAccount();
      const tx = (await post(id, 'credit', 10).expect(201)).body;
      const db = app.get<Knex>(KNEX);
      await expect(db('transactions').where({ id: tx.id }).update({ amount: 999 })).rejects.toThrow(
        /immutable/,
      );
      await expect(db('transactions').where({ id: tx.id }).delete()).rejects.toThrow(/immutable/);
      await api.delete(`/accounts/${id}/transactions`).expect(404);
    });
  });

  describe('transaction history', () => {
    let id: string;

    beforeAll(async () => {
      id = await createAccount();
      // 7 credits and 5 debits, in a known order
      for (let i = 1; i <= 12; i++) {
        await post(
          id,
          i % 2 === 0 && i <= 10 ? 'debit' : 'credit',
          i % 2 === 0 ? 1 : 10,
          `H-${i}`,
        ).expect(201);
      }
    });

    it('returns latest-first with pagination metadata', async () => {
      const res = await api.get(`/accounts/${id}/transactions?page=1&limit=5`).expect(200);
      expect(res.body.pagination).toEqual({ page: 1, limit: 5, total_records: 12, total_pages: 3 });
      expect(res.body.data.map((t: { reference_id: string }) => t.reference_id)).toEqual([
        'H-12',
        'H-11',
        'H-10',
        'H-9',
        'H-8',
      ]);

      const last = await api.get(`/accounts/${id}/transactions?page=3&limit=5`).expect(200);
      expect(last.body.data).toHaveLength(2);

      const beyond = await api.get(`/accounts/${id}/transactions?page=9&limit=5`).expect(200);
      expect(beyond.body.data).toEqual([]);
    });

    it('filters by type', async () => {
      const debits = await api.get(`/accounts/${id}/transactions?type=debit&limit=100`).expect(200);
      expect(debits.body.pagination.total_records).toBe(5);
      expect(debits.body.data.every((t: { type: string }) => t.type === 'debit')).toBe(true);

      const credits = await api.get(`/accounts/${id}/transactions?type=credit`).expect(200);
      expect(credits.body.pagination.total_records).toBe(7);
    });

    it('uses defaults when no paging params are given', async () => {
      const res = await api.get(`/accounts/${id}/transactions`).expect(200);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total_records: 12 });
    });

    it.each(['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=101', 'limit=2.5', 'type=refund'])(
      'rejects invalid query %s',
      async (qs) => {
        const res = await api.get(`/accounts/${id}/transactions?${qs}`).expect(400);
        expect(res.body.error).toBe('VALIDATION_ERROR');
      },
    );

    it('returns 404 for an unknown account', async () => {
      await api.get('/accounts/00000000-0000-4000-8000-000000000000/transactions').expect(404);
    });
  });

  describe('transfers', () => {
    const transfer = (from: string, to: string, amount: number, reference_id = nextRef()) =>
      api
        .post('/transfers')
        .send({ from_account_id: from, to_account_id: to, amount, reference_id });

    it('moves money between accounts (spec example)', async () => {
      const a = await createAccount('A');
      const b = await createAccount('B');
      await post(a, 'credit', 100).expect(201);
      await post(b, 'credit', 50).expect(201);

      const res = await transfer(a, b, 30).expect(201);
      expect(res.body.debit).toMatchObject({
        account_id: a,
        type: 'debit',
        balance_after: '70.00',
      });
      expect(res.body.credit).toMatchObject({
        account_id: b,
        type: 'credit',
        balance_after: '80.00',
      });
      expect(res.body.debit.transfer_id).toBe(res.body.transfer_id);
      expect(await balanceOf(a)).toBe('70.00');
      expect(await balanceOf(b)).toBe('80.00');
    });

    it('rejects insufficient balance with no partial transfer', async () => {
      const a = await createAccount();
      const b = await createAccount();
      await post(a, 'credit', 10).expect(201);
      expect((await transfer(a, b, 30).expect(422)).body.error).toBe('INSUFFICIENT_BALANCE');
      expect(await balanceOf(a)).toBe('10.00');
      expect(await balanceOf(b)).toBe('0.00');
    });

    it('rolls back the debit when the credit leg fails', async () => {
      const a = await createAccount();
      const b = await createAccount();
      await post(a, 'credit', 100).expect(201);
      // b already used this reference, so the credit leg conflicts after the debit leg was written
      await post(b, 'credit', 1, 'TAKEN-REF').expect(201);

      expect((await transfer(a, b, 40, 'TAKEN-REF').expect(409)).body.error).toBe(
        'DUPLICATE_TRANSACTION',
      );
      expect(await balanceOf(a)).toBe('100.00');
      expect(await balanceOf(b)).toBe('1.00');
      const history = await api.get(`/accounts/${a}/transactions`).expect(200);
      expect(history.body.pagination.total_records).toBe(1);
    });

    it('returns 404 when either account is missing, and changes nothing', async () => {
      const a = await createAccount();
      await post(a, 'credit', 100).expect(201);
      const missing = '00000000-0000-4000-8000-000000000000';
      expect((await transfer(a, missing, 10).expect(404)).body.error).toBe('ACCOUNT_NOT_FOUND');
      expect((await transfer(missing, a, 10).expect(404)).body.error).toBe('ACCOUNT_NOT_FOUND');
      expect(await balanceOf(a)).toBe('100.00');
    });

    it('lets only one of several racing transfers with the same reference through', async () => {
      const a = await createAccount();
      const b = await createAccount();
      await post(a, 'credit', 100).expect(201);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => transfer(a, b, 10, 'TRF-RACE')),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      const conflicts = results.filter((r) => r.status === 409);
      expect(conflicts).toHaveLength(4);
      for (const r of conflicts) {
        expect(r.body.details.existing_transaction.reference_id).toBe('TRF-RACE');
      }
      expect(await balanceOf(a)).toBe('90.00');
      expect(await balanceOf(b)).toBe('10.00');
    });

    it('rejects a transfer to the same account', async () => {
      const a = await createAccount();
      expect((await transfer(a, a, 10).expect(400)).body.error).toBe('INVALID_TRANSFER');
    });

    it('handles opposite-direction transfers concurrently without deadlock or drift', async () => {
      const a = await createAccount();
      const b = await createAccount();
      await post(a, 'credit', 100).expect(201);
      await post(b, 'credit', 100).expect(201);

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => (i % 2 ? transfer(a, b, 5) : transfer(b, a, 5))),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(await balanceOf(a)).toBe('100.00');
      expect(await balanceOf(b)).toBe('100.00');
    });
  });

  describe('auth', () => {
    it('registers a user and logs in with a Bearer token', async () => {
      const email = nextEmail();
      const reg = await http
        .post('/auth/register')
        .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD })
        .expect(201);
      expect(reg.body).toEqual({ id: expect.any(String), email, created_at: expect.any(String) });

      const login = await http.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      expect(login.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
      expect(login.body.access_token).toEqual(expect.any(String));
    });

    it('rejects an email that is already registered, ignoring case', async () => {
      const email = nextEmail();
      await http.post('/auth/register').send({ email, password: PASSWORD }).expect(201);
      const res = await http
        .post('/auth/register')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(409);
      expect(res.body.error).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it.each([
      [{ email: 'not-an-email', password: PASSWORD }, 'email'],
      [{ email: 'a@example.com', password: 'short' }, 'password'],
      [{ password: PASSWORD }, 'email'],
      [{ email: 'a@example.com' }, 'password'],
    ])('rejects invalid registration %j (field %s)', async (body, field) => {
      const res = await http.post('/auth/register').send(body).expect(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const email = nextEmail();
      await http.post('/auth/register').send({ email, password: PASSWORD }).expect(201);
      const wrong = await http.post('/auth/login').send({ email, password: 'wrong-password' });
      const unknown = await http
        .post('/auth/login')
        .send({ email: nextEmail(), password: PASSWORD });
      for (const res of [wrong, unknown]) {
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }
    });

    it('requires a valid token on every ledger endpoint', async () => {
      const id = await createAccount();
      const calls = [
        http.post('/accounts').send({ name: 'X' }),
        http.get(`/accounts/${id}`),
        http.get(`/accounts/${id}/balance`),
        http.get(`/accounts/${id}/transactions`),
        http.post(`/accounts/${id}/transactions`).send({}),
        http.post('/transfers').send({}),
        http.get(`/accounts/${id}`).set('Authorization', 'Bearer not.a.jwt'),
        http.get(`/accounts/${id}`).set('Authorization', 'Basic abc'),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('UNAUTHORIZED');
      }
    });

    it('keeps the API docs public', async () => {
      await http.get('/api/docs-json').expect(200);
    });
  });

  describe('ownership', () => {
    let bob: Client;
    let alicesAccount: string;

    beforeAll(async () => {
      bob = await signUp();
      alicesAccount = await createAccount('Alice');
      await post(alicesAccount, 'credit', 100).expect(201);
    });

    it("hides another user's account behind a 404 and leaves it untouched", async () => {
      const calls = [
        bob.get(`/accounts/${alicesAccount}`),
        bob.get(`/accounts/${alicesAccount}/balance`),
        bob.get(`/accounts/${alicesAccount}/transactions`),
        post(alicesAccount, 'debit', 50, nextRef(), bob),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('ACCOUNT_NOT_FOUND');
      }
      expect(await balanceOf(alicesAccount)).toBe('100.00');
    });

    it("refuses a transfer out of another user's account", async () => {
      const bobsAccount = await createAccount('Bob', bob);
      const res = await bob
        .post('/transfers')
        .send({
          from_account_id: alicesAccount,
          to_account_id: bobsAccount,
          amount: 10,
          reference_id: nextRef(),
        })
        .expect(404);
      expect(res.body.details.account_id).toBe(alicesAccount);
      expect(await balanceOf(alicesAccount)).toBe('100.00');
    });

    it("pays into another user's account without revealing their balance", async () => {
      const bobsAccount = await createAccount('Bob', bob);
      await post(bobsAccount, 'credit', 20, nextRef(), bob).expect(201);

      const res = await bob
        .post('/transfers')
        .send({
          from_account_id: bobsAccount,
          to_account_id: alicesAccount,
          amount: 5,
          reference_id: nextRef(),
        })
        .expect(201);
      expect(res.body.debit.balance_after).toBe('15.00');
      expect(res.body.credit).toBeNull();
      expect(await balanceOf(alicesAccount)).toBe('105.00');
    });

    it("does not leak the recipient's transaction on a duplicate reference", async () => {
      const bobsAccount = await createAccount('Bob', bob);
      await post(bobsAccount, 'credit', 20, nextRef(), bob).expect(201);
      await post(alicesAccount, 'credit', 1, 'ALICE-PRIVATE').expect(201);

      const res = await bob
        .post('/transfers')
        .send({
          from_account_id: bobsAccount,
          to_account_id: alicesAccount,
          amount: 5,
          reference_id: 'ALICE-PRIVATE',
        })
        .expect(409);
      expect(res.body.error).toBe('DUPLICATE_TRANSACTION');
      expect(res.body.details.existing_transaction).toBeUndefined();
      expect(await balanceOf(bobsAccount, bob)).toBe('20.00');
    });
  });
});
