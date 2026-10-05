import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { profileInputSchema, profileUpdateSchema } from '@sparshtomar/olive-shared';
import type { UserService } from './user.service';

/** Onboarding: no auth, creates the identity the device keeps. */
export const publicUserRoutes: FastifyPluginAsyncZod<{ users: UserService }> = async (app, { users }) => {
  app.post('/users', { schema: { body: profileInputSchema } }, async (request, reply) =>
    reply.status(201).send(await users.create(request.body)),
  );
};

export const meRoutes: FastifyPluginAsyncZod<{ users: UserService }> = async (app, { users }) => {
  app.get('/me', async (request) => request.user);

  app.patch('/me', { schema: { body: profileUpdateSchema } }, async (request) =>
    users.update(request.user.id, request.body),
  );

  /** "Start over": wipes the profile and everything attached to it. */
  app.delete('/me', async (request, reply) => {
    await users.delete(request.user.id);
    return reply.status(204).send();
  });
};
