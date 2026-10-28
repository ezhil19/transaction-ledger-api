import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../transaction-type.enum';

export class TransactionResponseDto {
  @ApiProperty({ example: '0192f1d3-1a2b-7c3d-8e4f-5a6b7c8d9e0f', format: 'uuid' })
  id: string;

  @ApiProperty({ example: '0192f1d2-7c4e-7a3b-9f1e-2d3c4b5a6978', format: 'uuid' })
  account_id: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ example: '50.00' })
  amount: string;

  @ApiProperty({ example: 'Salary for October', nullable: true })
  description: string | null;

  @ApiProperty({ example: 'INV-2026-0001' })
  reference_id: string;

  @ApiProperty({ example: '150.00', description: 'Account balance right after this entry' })
  balance_after: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Set on transfer legs' })
  transfer_id: string | null;

  @ApiProperty({ example: '2026-10-27T10:15:30.123Z' })
  created_at: string;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 42 })
  total_records: number;

  @ApiProperty({ example: 5 })
  total_pages: number;
}

export class TransactionListResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination: PaginationMetaDto;
}
