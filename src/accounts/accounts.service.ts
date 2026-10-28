import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { AccountNotFoundException } from '../common/errors/app.exception';
import { toMoney } from '../common/money';
import { KNEX } from '../database/database.module';
import { AccountResponseDto, BalanceResponseDto } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';

export interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  balance: string;
  created_at: Date;
}

export const toAccountResponse = (row: AccountRow): AccountResponseDto => ({
  id: row.id,
  name: row.name,
  balance: toMoney(row.balance),
  created_at: row.created_at.toISOString(),
});

export interface FindAccountOptions {
  /** Only match an account owned by this user. */
  ownerId?: string;
  trx?: Knex.Transaction;
  /** Row-lock the account (needs `trx`). */
  forUpdate?: boolean;
}

@Injectable()
export class AccountsService {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  async create(userId: string, dto: CreateAccountDto): Promise<AccountResponseDto> {
    const id = uuidv7();
    // balance and created_at come from column defaults, never from the client
    await this.knex('accounts').insert({ id, user_id: userId, name: dto.name });
    return toAccountResponse(await this.findRowOrFail(id));
  }

  async findOne(userId: string, id: string): Promise<AccountResponseDto> {
    return toAccountResponse(await this.findRowOrFail(id, { ownerId: userId }));
  }

  async getBalance(userId: string, id: string): Promise<BalanceResponseDto> {
    const row = await this.findRowOrFail(id, { ownerId: userId });
    return { account_id: row.id, balance: toMoney(row.balance) };
  }

  /**
   * Throws 404 unless the account exists (and, with `ownerId`, belongs to that user). Another
   * user's account gets the same 404 as a missing one, so ids can't be probed.
   */
  async findRowOrFail(
    id: string,
    { ownerId, trx, forUpdate = false }: FindAccountOptions = {},
  ): Promise<AccountRow> {
    const query = (trx ?? this.knex)<AccountRow>('accounts').where({ id }).first();
    if (ownerId) query.andWhere({ user_id: ownerId });
    if (forUpdate) query.forUpdate();
    const row = await query;
    if (!row) throw new AccountNotFoundException(id);
    return row;
  }
}
