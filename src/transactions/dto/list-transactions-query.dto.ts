import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TransactionType } from '../transaction-type.enum';

export const MAX_PAGE_LIMIT = 100;

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ enum: TransactionType, description: 'Omit to return both types' })
  @IsOptional()
  @IsEnum(TransactionType, { message: 'type must be either credit or debit' })
  type?: TransactionType;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: MAX_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_PAGE_LIMIT, { message: `limit must not be greater than ${MAX_PAGE_LIMIT}` })
  limit: number = 10;
}
