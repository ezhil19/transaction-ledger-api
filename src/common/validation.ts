import { Injectable, PipeTransform, ValidationError, ValidationPipe } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { InvalidAccountIdException, ValidationException } from './errors/app.exception';

function flatten(errors: ValidationError[], parent = ''): { field: string; errors: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, errors: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    // Unknown fields (e.g. `balance` on account creation) are rejected, not silently dropped.
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationException(flatten(errors)),
  });
}

/** Validates an account id route param as a UUID before it reaches the database. */
@Injectable()
export class ParseAccountIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) throw new InvalidAccountIdException(value);
    return value.toLowerCase();
  }
}
