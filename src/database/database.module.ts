import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';

export const KNEX = Symbol('KNEX');

@Global()
@Module({
  providers: [
    {
      provide: KNEX,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Knex =>
        knex({
          client: 'mysql2',
          connection: {
            host: config.get<string>('DB_HOST'),
            port: Number(config.get('DB_PORT', 3306)),
            user: config.get<string>('DB_USER'),
            password: config.get<string>('DB_PASSWORD'),
            database: config.get<string>('DB_NAME'),
            // Keep DECIMAL columns as strings so money never passes through JS floats.
            decimalNumbers: false,
            // Store and read DATETIME values as UTC.
            timezone: 'Z',
            dateStrings: false,
          },
          pool: {
            min: 1,
            max: 10,
            afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
              conn.query("SET time_zone = '+00:00'", (err: Error | null) => done(err, conn));
            },
          },
        }),
    },
  ],
  exports: [KNEX],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  async onApplicationShutdown(): Promise<void> {
    await this.knex.destroy();
  }
}
