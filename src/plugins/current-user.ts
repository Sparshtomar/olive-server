import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { USER_ID_HEADER, type User } from '@sparshtomar/olive-shared';
import { AppError, unknownUser } from '../lib/errors';
import type { UserService } from '../modules/users';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

const uuid = z.uuid();

/**
 * Identifies the caller. Olive has no login (out of scope), so the device keeps the
 * user id it got at onboarding and sends it in a header. This plugin is the single
 * seam where real auth (e.g. a JWT verifier) would replace the header lookup -
 * routes only ever read `request.user`.
 */
export const currentUser = fp<{ users: UserService }>(async (app: FastifyInstance, { users }) => {
  app.decorateRequest('user', null as unknown as User);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const id = request.headers[USER_ID_HEADER];
    if (typeof id !== 'string' || !uuid.safeParse(id).success) throw unknownUser();
    try {
      request.user = await users.get(id);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) throw unknownUser();
      throw err;
    }
  });
});
