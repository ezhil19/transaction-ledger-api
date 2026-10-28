import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 422 })
  statusCode: number;

  @ApiProperty({ example: 'INSUFFICIENT_BALANCE', description: 'Machine-readable error code' })
  error: string;

  @ApiProperty({ example: 'Insufficient balance: available 100.00, requested 150.00' })
  message: string;

  @ApiPropertyOptional({ description: 'Extra context, e.g. per-field validation errors' })
  details?: unknown;

  @ApiProperty({ example: '/accounts/0192f1d2-.../transactions' })
  path: string;

  @ApiProperty({ example: '2026-10-27T10:15:30.123Z' })
  timestamp: string;
}
