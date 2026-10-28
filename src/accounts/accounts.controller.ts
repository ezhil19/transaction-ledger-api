import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ParseAccountIdPipe } from '../common/validation';
import { AccountsService } from './accounts.service';
import { AccountResponseDto, BalanceResponseDto } from './dto/account-response.dto';
import { CreateAccountDto } from './dto/create-account.dto';

@ApiTags('Accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHORIZED' })
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an account',
    description:
      'The account belongs to the logged-in user. Balance always starts at 0. Sending ' +
      '`balance` (or any unknown field) is rejected.',
  })
  @ApiCreatedResponse({ type: AccountResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_ERROR' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accounts.create(user.id, dto);
  }

  @Get(':accountId')
  @ApiOperation({ summary: 'Get one of your accounts' })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiOkResponse({ type: AccountResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'INVALID_ACCOUNT_ID' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'ACCOUNT_NOT_FOUND' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('accountId', ParseAccountIdPipe) id: string,
  ): Promise<AccountResponseDto> {
    return this.accounts.findOne(user.id, id);
  }

  @Get(':accountId/balance')
  @ApiOperation({ summary: 'Get the current balance of one of your accounts' })
  @ApiParam({ name: 'accountId', format: 'uuid' })
  @ApiOkResponse({ type: BalanceResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'INVALID_ACCOUNT_ID' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'ACCOUNT_NOT_FOUND' })
  getBalance(
    @CurrentUser() user: AuthUser,
    @Param('accountId', ParseAccountIdPipe) id: string,
  ): Promise<BalanceResponseDto> {
    return this.accounts.getBalance(user.id, id);
  }
}
