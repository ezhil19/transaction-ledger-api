import { ApiProperty } from '@nestjs/swagger';

export class AccountResponseDto {
  @ApiProperty({ example: '0192f1d2-7c4e-7a3b-9f1e-2d3c4b5a6978', format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ezhil Kumar' })
  name: string;

  @ApiProperty({ example: '0.00', description: 'Decimal string with 2 places' })
  balance: string;

  @ApiProperty({ example: '2026-10-27T10:15:30.123Z' })
  created_at: string;
}

export class BalanceResponseDto {
  @ApiProperty({ example: '0192f1d2-7c4e-7a3b-9f1e-2d3c4b5a6978', format: 'uuid' })
  account_id: string;

  @ApiProperty({ example: '150.00', description: 'Decimal string with 2 places' })
  balance: string;
}
