import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { MAX_AMOUNT } from '../../common/money';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid', example: '0192f1d2-7c4e-7a3b-9f1e-2d3c4b5a6978' })
  @IsUUID('all', { message: 'from_account_id must be a valid account id (UUID)' })
  from_account_id: string;

  @ApiProperty({ format: 'uuid', example: '0192f1d2-8d5f-7b4c-a02f-3e4d5c6b7a89' })
  @IsUUID('all', { message: 'to_account_id must be a valid account id (UUID)' })
  to_account_id: string;

  @ApiProperty({ example: 30, minimum: 0.01, description: 'Up to 2 decimal places' })
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: 'amount must be a number with at most 2 decimal places' },
  )
  @IsPositive({ message: 'amount must be greater than 0' })
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiPropertyOptional({ example: 'Rent share', maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'TRF-2026-0001',
    maxLength: 100,
    description: 'Used as the reference_id of both legs; must be unused on both accounts',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reference_id: string;
}
