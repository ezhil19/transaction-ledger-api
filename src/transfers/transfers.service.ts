import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { AccountsService } from '../accounts/accounts.service';
import {
  DuplicateTransactionException,
  InvalidTransferException,
} from '../common/errors/app.exception';
import { toMoney } from '../common/money';
import { KNEX } from '../database/database.module';
import { TransactionType } from '../transactions/transaction-type.enum';
import { isDuplicateKeyError, TransactionsService } from '../transactions/transactions.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';

@Injectable()
export class TransfersService {
  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
  ) {}

  async create(userId: string, dto: CreateTransferDto): Promise<TransferResponseDto> {
    const fromId = dto.from_account_id.toLowerCase();
    const toId = dto.to_account_id.toLowerCase();
    if (fromId === toId) {
      throw new InvalidTransferException('from_account_id and to_account_id must be different');
    }

    const amount = new Decimal(dto.amount);
    const transferId = uuidv7();

    try {
      // Debit + credit share one DB transaction: any failure rolls back both legs.
      return await this.knex.transaction(async (trx) => {
        // Lock both rows in a fixed (id) order so opposite-direction transfers can't deadlock.
        // The source must belong to the caller; the destination can be anyone's.
        const lock = (id: string) =>
          this.accounts.findRowOrFail(id, {
            ownerId: id === fromId ? userId : undefined,
            trx,
            forUpdate: true,
          });
        const [firstId, secondId] = [fromId, toId].sort();
        const first = await lock(firstId);
        const second = await lock(secondId);
        const source = first.id === fromId ? first : second;
        const destination = source === first ? second : first;

        const debit = await this.transactions.postEntry(trx, source, {
          type: TransactionType.DEBIT,
          amount,
          description: dto.description ?? `Transfer to account ${toId}`,
          reference_id: dto.reference_id,
          transfer_id: transferId,
        });
        const credit = await this.transactions.postEntry(trx, destination, {
          type: TransactionType.CREDIT,
          amount,
          description: dto.description ?? `Transfer from account ${fromId}`,
          reference_id: dto.reference_id,
          transfer_id: transferId,
        });

        return {
          transfer_id: transferId,
          from_account_id: fromId,
          to_account_id: toId,
          amount: toMoney(amount),
          reference_id: dto.reference_id,
          debit,
          // The credit leg shows the recipient's balance, so only the recipient's owner sees it.
          credit: destination.user_id === userId ? credit : null,
        };
      });
    } catch (e) {
      // From the in-code check on either leg, or the UNIQUE index if a concurrent request won.
      if (e instanceof DuplicateTransactionException || isDuplicateKeyError(e)) {
        throw await this.duplicateError(fromId, toId, dto.reference_id);
      }
      throw e;
    }
  }

  /**
   * Only the caller's own (source) transaction is shown. If the clash is on the destination, it
   * may belong to another user, so its details are left out.
   */
  private async duplicateError(fromId: string, toId: string, referenceId: string) {
    const existing = await this.transactions.findByReference(this.knex, fromId, referenceId);
    return existing
      ? new DuplicateTransactionException(fromId, referenceId, existing)
      : new DuplicateTransactionException(toId, referenceId);
  }
}
