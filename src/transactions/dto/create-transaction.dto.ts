import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import { MAX_AMOUNT } from '../../common/money';
import { TransactionType } from '../transaction-type.enum';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType, example: TransactionType.CREDIT })
  @IsEnum(TransactionType, { message: 'type must be either credit or debit' })
  type: TransactionType;

  @ApiProperty({ example: 50.25, minimum: 0.01, description: 'Up to 2 decimal places' })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than 0' })
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiPropertyOptional({ example: 'Salary for October', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'INV-2026-0001',
    maxLength: 100,
    description: 'Idempotency key, unique per account',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference_id: string;
}
