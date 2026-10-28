import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'ezhil@example.com', maxLength: 255 })
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'S3cure-pass', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ezhil@example.com' })
  @Transform(normaliseEmail)
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'S3cure-pass' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class UserResponseDto {
  @ApiProperty({ example: '0192f1d1-0a1b-7c2d-8e3f-4a5b6c7d8e9f', format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ezhil@example.com' })
  email: string;

  @ApiProperty({ example: '2026-10-28T10:15:30.123Z' })
  created_at: string;
}

export class TokenResponseDto {
  @ApiProperty({ description: 'Send as `Authorization: Bearer <access_token>`' })
  access_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: 'Bearer';

  @ApiProperty({ example: 3600, description: 'Lifetime in seconds' })
  expires_in: number;
}
