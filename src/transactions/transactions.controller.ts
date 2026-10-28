import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseAccountIdPipe } from '../common/validation';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { TransactionListResponseDto, TransactionResponseDto } from './dto/transaction-response.dto';
import { TransactionsService } from './transactions.service';

// Transactions are immutable: this controller deliberately has no PUT, PATCH or DELETE routes.
@ApiTags('Transactions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHORIZED' })
@Controller('accounts/:accountId/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a credit or debit transaction',
    description:
      'Creates the transaction and updates the balance atomically. Re-sending the same ' +
      '`reference_id` for this account returns 409 and changes nothing.',
  })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR / INVALID_ACCOUNT_ID / INVALID_REQUEST_BODY',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'DUPLICATE_TRANSACTION' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INSUFFICIENT_BALANCE' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('accountId', ParseAccountIdPipe) accountId: string,
    @Body() dto: CreateTransactionDto,
  ): Promise<TransactionResponseDto> {
    return this.transactions.create(user.id, accountId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Transaction history (latest first, paginated, optional type filter)',
  })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiOkResponse({ type: TransactionListResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR (bad page/limit/type) / INVALID_ACCOUNT_ID',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'ACCOUNT_NOT_FOUND' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('accountId', ParseAccountIdPipe) accountId: string,
    @Query() query: ListTransactionsQueryDto,
  ): Promise<TransactionListResponseDto> {
    return this.transactions.list(user.id, accountId, query);
  }
}
