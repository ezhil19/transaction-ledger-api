import { HttpException, HttpStatus } from '@nestjs/common';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST_BODY = 'INVALID_REQUEST_BODY',
  INVALID_ACCOUNT_ID = 'INVALID_ACCOUNT_ID',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  INVALID_TRANSFER = 'INVALID_TRANSFER',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Base class for every error the API raises on purpose. The global filter turns it into
 * `{ statusCode, error, message, details?, path, timestamp }`.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export class ValidationException extends AppException {
  constructor(details: { field: string; errors: string[] }[]) {
    super(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, 'Request validation failed', details);
  }
}

export class InvalidRequestBodyException extends AppException {
  constructor() {
    super(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_REQUEST_BODY, 'Request body is not valid JSON');
  }
}

export class InvalidAccountIdException extends AppException {
  constructor(value: string) {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.INVALID_ACCOUNT_ID,
      `'${value}' is not a valid account id (expected a UUID)`,
    );
  }
}

export class AccountNotFoundException extends AppException {
  constructor(accountId: string) {
    super(HttpStatus.NOT_FOUND, ErrorCode.ACCOUNT_NOT_FOUND, `Account ${accountId} not found`, {
      account_id: accountId,
    });
  }
}

export class InsufficientBalanceException extends AppException {
  constructor(accountId: string, balance: string, requested: string) {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.INSUFFICIENT_BALANCE,
      `Insufficient balance: available ${balance}, requested ${requested}`,
      { account_id: accountId, balance, requested_amount: requested },
    );
  }
}

export class DuplicateTransactionException extends AppException {
  constructor(accountId: string, referenceId: string, existing?: unknown) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.DUPLICATE_TRANSACTION,
      `A transaction with reference_id '${referenceId}' already exists for account ${accountId}`,
      { account_id: accountId, reference_id: referenceId, existing_transaction: existing },
    );
  }
}

export class InvalidTransferException extends AppException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, ErrorCode.INVALID_TRANSFER, message);
  }
}

export class UnauthorizedException extends AppException {
  constructor(message = 'A valid Bearer token is required') {
    super(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, message);
  }
}

export class InvalidCredentialsException extends AppException {
  constructor() {
    super(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
  }
}

export class EmailAlreadyRegisteredException extends AppException {
  constructor(email: string) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      `An account with email '${email}' is already registered`,
    );
  }
}
