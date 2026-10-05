import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { analyzeTextSchema, createMealSchema, updateMealSchema } from '@sparshtomar/olive-shared';
import { unsupportedFile } from '../../lib/errors';
import { detectAudioType, detectImageType, isHeic } from '../../lib/files';
import { readUpload } from '../../lib/multipart';
import type { MealService } from './meal.service';

const idParams = z.object({ id: z.uuid() });

/** AI calls cost quota; keep one user from draining it for everyone. */
const AI_RATE_LIMIT = { rateLimit: { max: 15, timeWindow: '1 minute' } };

export const mealRoutes: FastifyPluginAsyncZod<{ meals: MealService }> = async (app, { meals }) => {
  app.post('/meals/analyze/text', { schema: { body: analyzeTextSchema }, config: AI_RATE_LIMIT }, async (request) =>
    meals.analyze({ kind: 'text', text: request.body.text }),
  );

  app.post('/meals/analyze/photo', { config: AI_RATE_LIMIT }, async (request) => {
    const { data, fields } = await readUpload(request, 8);
    const mimeType = detectImageType(data) ?? (isHeic(data) ? 'image/heic' : undefined);
    if (!mimeType) throw unsupportedFile('That file is not a photo Olive can read');
    return meals.analyze({ kind: 'photo', data, mimeType, caption: fields.caption?.slice(0, 200) || undefined });
  });

  app.post('/meals/analyze/voice', { config: AI_RATE_LIMIT }, async (request) => {
    const { data, mimeType: declared } = await readUpload(request, 5);
    const mimeType = detectAudioType(data, declared);
    if (!mimeType) throw unsupportedFile('That recording format is not supported');
    return meals.analyze({ kind: 'voice', data, mimeType });
  });

  app.post('/meals', { schema: { body: createMealSchema }, bodyLimit: 1024 * 1024 }, async (request, reply) => {
    const { meal, created } = await meals.create(request.user.id, request.body);
    // 200 on a replayed create tells the client "already saved" without an error.
    return reply.status(created ? 201 : 200).send(meal);
  });

  app.get('/meals/:id', { schema: { params: idParams } }, async (request) =>
    meals.get(request.user.id, request.params.id),
  );

  app.patch('/meals/:id', { schema: { params: idParams, body: updateMealSchema } }, async (request) =>
    meals.update(request.user.id, request.params.id, request.body),
  );

  app.delete('/meals/:id', { schema: { params: idParams } }, async (request, reply) => {
    await meals.delete(request.user.id, request.params.id);
    return reply.status(204).send();
  });
};

/**
 * Served without the user header so <Image> can load it directly. The meal's random
 * UUID acts as a capability URL; swap for signed URLs when real auth exists.
 */
export const mealPhotoRoutes: FastifyPluginAsyncZod<{ meals: MealService }> = async (app, { meals }) => {
  app.get('/meals/:id/photo', { schema: { params: idParams } }, async (request, reply) => {
    const photo = await meals.photo(request.params.id);
    return reply
      .header('content-type', photo.mimeType)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(photo.data);
  });
};
