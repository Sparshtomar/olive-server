import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
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
}

export const buildApp = async ({ container, corsOrigin, logger, rateLimit: limit = true }: AppOptions) => {
  const app = Fastify({ loggerInstance: logger, trustProxy: true, bodyLimit: 512 * 1024 });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(cors, { origin: corsOrigin, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(multipart);
  await app.register(rateLimit, {
    global: false,
    enableDraftSpec: true,
    // Per user when known, else per IP.
    keyGenerator: (req) => String(req.headers[USER_ID_HEADER] ?? req.ip),
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

  app.get('/health', async () => ({ ok: true }));

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
