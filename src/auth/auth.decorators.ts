import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** The authenticated caller, taken from the verified JWT. */
export interface AuthUser {
  id: string;
  email: string;
}

export const IS_PUBLIC = 'isPublic';

/** Opts a route out of the global JWT guard (register and login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
