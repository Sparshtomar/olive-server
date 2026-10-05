import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DATE_KEY_REGEX } from '@sparshtomar/olive-shared';
import type { ProgressService } from './progress.service';

const dateKey = z.string().regex(DATE_KEY_REGEX, 'Expected YYYY-MM-DD');

export const progressRoutes: FastifyPluginAsyncZod<{ progress: ProgressService }> = async (app, { progress }) => {
  app.get('/days/:date', { schema: { params: z.object({ date: dateKey }) } }, async (request) =>
    progress.day(request.user, request.params.date),
  );

  app.get(
    '/trends',
    { schema: { querystring: z.object({ end: dateKey, days: z.coerce.number().int().min(1).max(90).default(7) }) } },
    async (request) => progress.trends(request.user, request.query.end, request.query.days),
  );

  app.get('/insights', { schema: { querystring: z.object({ today: dateKey }) } }, async (request) =>
    progress.insights(request.user, request.query.today),
  );
};
