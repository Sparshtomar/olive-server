import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import { USER_ID_HEADER } from '@sparshtomar/olive-shared';
import type { Container } from './container';
import { demoRoutes } from './modules/demo';
import { mealPhotoRoutes, mealRoutes } from './modules/meals';
import { progressRoutes } from './modules/progress';
import { reportRoutes } from './modules/reports';
import { meRoutes, publicUserRoutes } from './modules/users';
import { currentUser } from './plugins/current-user';
import { registerErrorHandler } from './plugins/error-handler';

export interface AppOptions {
  container: Container;
  corsOrigin: boolean | string[];
  logger?: FastifyBaseLogger;
  /** Turned off in tests so suites can hammer endpoints. */
  rateLimit?: boolean;
  /** Resolves when the database answers. Without it, /health only proves the process is up. */
  ping?: () => Promise<unknown>;
  /** Shared store for rate-limit counters. Without it they live in process memory (one instance only). */
  redis?: Redis;
}

/** A health probe must answer fast; a hung database counts as down. */
const HEALTH_TIMEOUT_MS = 2000;

export const buildApp = async ({ container, corsOrigin, logger, rateLimit: limit = true, ping, redis }: AppOptions) => {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
    bodyLimit: 512 * 1024,
    // Honour an id from the client or proxy so one id follows a request across hops.
    requestIdHeader: 'x-request-id',
  });

  // Every response carries its request id, so a user-reported failure can be found in the logs.
  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  // Baseline security headers. No CSP: this is a JSON API, and a CSP would only break the docs page.
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: corsOrigin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(multipart);
  await app.register(rateLimit, {
    global: false,
    enableDraftSpec: true,
    // Per user when known, else per IP.
    keyGenerator: (req) => String(req.headers[USER_ID_HEADER] ?? req.ip),
    ...(redis ? { redis } : {}),
    ...(limit ? {} : { max: Number.MAX_SAFE_INTEGER }),
  });

  // OpenAPI docs generated from the same Zod schemas that validate requests, so they can't drift.
  await app.register(swagger, {
    openapi: {
      info: { title: 'Olive API', version: '0.1.0' },
      components: { securitySchemes: { device: { type: 'apiKey', in: 'header', name: USER_ID_HEADER } } },
      security: [{ device: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', async (request, reply) => {
    if (!ping) return { ok: true, db: 'skipped' };
    try {
      await Promise.race([
        ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('health check timed out')), HEALTH_TIMEOUT_MS)),
      ]);
      return { ok: true, db: 'ok' };
    } catch (err) {
      request.log.error({ err }, 'database unreachable');
      return reply.status(503).send({ ok: false, db: 'down' });
    }
  });

  const { users, meals, reports, progress, demo } = container;
  await app.register(publicUserRoutes, { users });
  await app.register(demoRoutes, { demo });
  await app.register(mealPhotoRoutes, { meals });

  // Everything below requires a known user.
  await app.register(async (authed) => {
    await authed.register(currentUser, { users });
    await authed.register(meRoutes, { users });
    await authed.register(mealRoutes, { meals });
    await authed.register(reportRoutes, { reports });
    await authed.register(progressRoutes, { progress });
  });

  return app;
};
