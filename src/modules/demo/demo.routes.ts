import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DATE_KEY_REGEX } from '@sparshtomar/olive-shared';
import type { DemoService } from './demo.service';

const demoBody = z.object({
  today: z.string().regex(DATE_KEY_REGEX),
  hour: z.number().int().min(0).max(23),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
});

/** No auth: "Explore with demo data" on the welcome screen creates a fresh demo user per tap. */
export const demoRoutes: FastifyPluginAsyncZod<{ demo: DemoService }> = async (app, { demo }) => {
  app.post(
    '/users/demo',
    // Each call writes two weeks of data; a tight limit keeps it from being used to fill the database.
    { schema: { body: demoBody }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => reply.status(201).send(await demo.createDemoUser(request.body)),
  );
};
