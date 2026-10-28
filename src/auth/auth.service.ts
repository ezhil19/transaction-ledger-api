import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import {
  EmailAlreadyRegisteredException,
  InvalidCredentialsException,
} from '../common/errors/app.exception';
import { KNEX } from '../database/database.module';
import { LoginDto, RegisterDto, TokenResponseDto, UserResponseDto } from './dto/auth.dto';
import { hashPassword, verifyPassword } from './password';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

@Injectable()
export class AuthService {
  // Checked against when the email is unknown, so both failure paths take about as long.
  private readonly dummyHash = hashPassword('not-a-real-password');

  constructor(
    @Inject(KNEX) private readonly knex: Knex,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const id = uuidv7();
    try {
      await this.knex('users').insert({
        id,
        email: dto.email,
        password_hash: await hashPassword(dto.password),
      });
    } catch (e) {
      // UNIQUE (email) decides, so two simultaneous sign-ups can't both succeed.
      if ((e as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new EmailAlreadyRegisteredException(dto.email);
      }
      throw e;
    }
    const row = await this.knex<UserRow>('users').where({ id }).first();
    return { id: row!.id, email: row!.email, created_at: row!.created_at.toISOString() };
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.knex<UserRow>('users').where({ email: dto.email }).first();
    const valid = await verifyPassword(dto.password, user?.password_hash ?? (await this.dummyHash));
    if (!user || !valid) throw new InvalidCredentialsException();

    return {
      access_token: await this.jwt.signAsync({ sub: user.id, email: user.email }),
      token_type: 'Bearer',
      expires_in: Number(this.config.get('JWT_EXPIRES_IN', 3600)),
    };
  }
}
