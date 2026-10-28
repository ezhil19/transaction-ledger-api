import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { AccountRow, AccountsService } from '../accounts/accounts.service';
import {
  DuplicateTransactionException,
  InsufficientBalanceException,
} from '../common/errors/app.exception';
import { toMoney } from '../common/money';
import { KNEX } from '../database/database.module';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { TransactionListResponseDto, TransactionResponseDto } from './dto/transaction-response.dto';
import { TransactionType } from './transaction-type.enum';

interface TransactionRow {
  id: string;
  account_id: string;
  type: TransactionType;
  amount: string;
  description: string | null;
  reference_id: string;
  balance_after: string;
  transfer_id: string | null;
  created_at: Date;
}

export interface LedgerEntryInput {
  type: TransactionType;
  amount: Decimal;
  description: string | null;
  reference_id: string;
  transfer_id?: string;
}

const toTransactionResponse = (row: TransactionRow): TransactionResponseDto => ({
  id: row.id,
  account_id: row.account_id,
  type: row.type,
  amount: toMoney(row.amount),
  description: row.description,
  reference_id: row.reference_id,
  balance_after: toMoney(row.balance_after),
  transfer_id: row.transfer_id,
  created_at: row.created_at.toISOString(),
});

export const isDuplicateKeyError = (e: unknown) =>
  (e as { code?: string })?.code === 'ER_DUP_ENTRY';

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly accounts: AccountsService,
  ) {}

  async create(
    userId: string,
    accountId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    try {
      return await this.knex.transaction(async (trx) => {
        // Row lock: concurrent writes to this account queue up here until we commit.
        const account = await this.accounts.findRowOrFail(accountId, {
          ownerId: userId,
          trx,
          forUpdate: true,
        });
        return this.postEntry(trx, account, {
          type: dto.type,
          amount: new Decimal(dto.amount),
          description: dto.description ?? null,
          reference_id: dto.reference_id,
        });
      });
    } catch (e) {
      // Safety net: the UNIQUE (account_id, reference_id) index is the final word on duplicates.
      if (isDuplicateKeyError(e)) {
        throw new DuplicateTransactionException(
          accountId,
          dto.reference_id,
          await this.findByReference(this.knex, accountId, dto.reference_id),
        );
      }
      throw e;
    }
  }

  /**
   * Writes one ledger entry and moves the balance. Must run inside `trx` with `account`
   * already locked FOR UPDATE; any throw rolls back both writes.
   */
  async postEntry(
    trx: Knex.Transaction,
    account: AccountRow,
    entry: LedgerEntryInput,
  ): Promise<TransactionResponseDto> {
    // Checked before the balance so a retried debit reports "duplicate", not "insufficient".
    const existing = await this.findByReference(trx, account.id, entry.reference_id);
    if (existing) {
      throw new DuplicateTransactionException(account.id, entry.reference_id, existing);
    }

    const current = new Decimal(account.balance);
    const next =
      entry.type === TransactionType.CREDIT
        ? current.plus(entry.amount)
        : current.minus(entry.amount);
    if (next.isNegative()) {
      throw new InsufficientBalanceException(account.id, toMoney(current), toMoney(entry.amount));
    }

    const id = uuidv7();
    await trx('transactions').insert({
      id,
      account_id: account.id,
      type: entry.type,
      amount: entry.amount.toFixed(2),
      description: entry.description,
      reference_id: entry.reference_id,
      balance_after: next.toFixed(2),
      transfer_id: entry.transfer_id ?? null,
    });
    await trx('accounts')
      .where({ id: account.id })
      .update({ balance: next.toFixed(2) });
    // Keep the in-memory row in step, so a second entry on the same account in this trx is correct.
    account.balance = next.toFixed(2);

    const row = await trx<TransactionRow>('transactions').where({ id }).first();
    return toTransactionResponse(row!);
  }

  async list(
    userId: string,
    accountId: string,
    query: ListTransactionsQueryDto,
  ): Promise<TransactionListResponseDto> {
    await this.accounts.findRowOrFail(accountId, { ownerId: userId });
    const { page, limit, type } = query;

    const base = this.knex<TransactionRow>('transactions').where({ account_id: accountId });
    if (type) base.andWhere({ type });

    const [{ total }] = await base.clone().count<{ total: number }[]>({ total: '*' });
    const rows = await base
      .clone()
      // ids are UUIDv7 (time-ordered), so they break created_at ties in insertion order
      .orderBy([
        { column: 'created_at', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(limit)
      .offset((page - 1) * limit);

    const totalRecords = Number(total);
    return {
      data: rows.map(toTransactionResponse),
      pagination: {
        page,
        limit,
        total_records: totalRecords,
        total_pages: Math.ceil(totalRecords / limit),
      },
    };
  }

  async findByReference(
    db: Knex | Knex.Transaction,
    accountId: string,
    referenceId: string,
  ): Promise<TransactionResponseDto | undefined> {
    const row = await db<TransactionRow>('transactions')
      .where({ account_id: accountId, reference_id: referenceId })
      .first();
    return row && toTransactionResponse(row);
  }
}
