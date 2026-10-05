import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createReportSchema } from '@sparshtomar/olive-shared';
import { readUpload } from '../../lib/multipart';
import type { ReportService } from './report.service';

const idParams = z.object({ id: z.uuid() });

export const reportRoutes: FastifyPluginAsyncZod<{ reports: ReportService }> = async (app, { reports }) => {
  app.post('/reports/analyze', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request) => {
    const { data } = await readUpload(request, 15);
    return reports.analyze(data);
  });

  app.post('/reports', { schema: { body: createReportSchema } }, async (request, reply) =>
    reply.status(201).send(await reports.create(request.user.id, request.user.sex, request.body)),
  );

  app.get('/reports', async (request) => reports.list(request.user.id));

  app.get('/reports/:id', { schema: { params: idParams } }, async (request) =>
    reports.get(request.user.id, request.params.id),
  );

  app.delete('/reports/:id', { schema: { params: idParams } }, async (request, reply) => {
    await reports.delete(request.user.id, request.params.id);
    return reply.status(204).send();
  });

  app.get('/markers', async (request) => reports.markerTrends(request.user.id, request.user.sex));
};
