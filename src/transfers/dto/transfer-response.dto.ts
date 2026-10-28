import { ApiProperty } from '@nestjs/swagger';
import { TransactionResponseDto } from '../../transactions/dto/transaction-response.dto';

export class TransferResponseDto {
  @ApiProperty({ format: 'uuid' })
  transfer_id: string;

  @ApiProperty({ format: 'uuid' })
  from_account_id: string;

  @ApiProperty({ format: 'uuid' })
  to_account_id: string;

  @ApiProperty({ example: '30.00' })
  amount: string;

  @ApiProperty({ example: 'TRF-2026-0001' })
  reference_id: string;

  @ApiProperty({ type: TransactionResponseDto, description: 'Debit leg on the source account' })
  debit: TransactionResponseDto;

  @ApiProperty({
    type: TransactionResponseDto,
    nullable: true,
    description:
      'Credit leg on the destination. `null` when the destination belongs to another user, ' +
      'because it shows their balance.',
  })
  credit: TransactionResponseDto | null;
}
