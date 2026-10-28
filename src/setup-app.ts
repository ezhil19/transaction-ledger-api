import { HttpException, INestApplication, NestApplicationOptions } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, NextFunction, Request, Response } from 'express';
import { InvalidRequestBodyException } from './common/errors/app.exception';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';

/** Nest's built-in parser is turned off so malformed JSON can be mapped to our own error code. */
export const appOptions: NestApplicationOptions = { bodyParser: false };

/** Shared by main.ts and the e2e tests, so tests run against the same pipeline as production. */
export function setupApp(app: INestApplication): void {
  app.use(json());
  app.use(
    (
      err: { type?: string; status?: number; message?: string },
      _req: Request,
      _res: Response,
      next: NextFunction,
    ) => {
      if (err?.type === 'entity.parse.failed') return next(new InvalidRequestBodyException());
      // Other body-parser rejections (e.g. 413 too large, 415 bad charset) keep their own status.
      if (err?.type && err.status && err.status < 500) {
        return next(new HttpException(err.message ?? 'Invalid request body', err.status));
      }
      next(err);
    },
  );
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Transaction Ledger API')
    .setDescription(
      'Accounts, credit/debit transactions, balances, paginated history and transfers. ' +
        'Money values are returned as 2-decimal strings. ' +
        'Register and log in under Auth, then click Authorize and paste the access_token.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
    jsonDocumentUrl: 'api/docs-json',
  });
}
