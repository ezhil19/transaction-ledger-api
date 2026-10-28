import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferResponseDto } from './dto/transfer-response.dto';
import { TransfersService } from './transfers.service';

@ApiTags('Transfers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'UNAUTHORIZED' })
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Transfer money between two accounts',
    description:
      'Writes a debit on the source and a credit on the destination in one database ' +
      'transaction. Either both legs are saved or neither is. The source account must be ' +
      'yours; the destination can be any account.',
  })
  @ApiCreatedResponse({ type: TransferResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_ERROR / INVALID_TRANSFER',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'DUPLICATE_TRANSACTION' })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'INSUFFICIENT_BALANCE' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponseDto> {
    return this.transfers.create(user.id, dto);
  }
}
