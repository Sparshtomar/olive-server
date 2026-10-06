import { Redis } from 'ioredis';
import pino from 'pino';
import { createAiServices } from './ai';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createContainer } from './container';
import { createDb } from './db/client';
import { runMigrations } from './db/migrate';

const env = loadEnv();

// Migrations are additive and idempotent; running them at boot keeps deploys one step.
await runMigrations(env.DATABASE_URL);

const { db, ping, close } = createDb(env.DATABASE_URL);
// Shared rate-limit counters when running more than one instance; in-memory otherwise.
const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 1 }) : undefined;
const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname' } },
  }),
});

const app = await buildApp({
  container: createContainer(db, createAiServices(env, logger)),
  corsOrigin: env.CORS_ORIGIN,
  logger,
  ping,
  redis,
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await close();
  redis?.disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: env.HOST });
app.log.info(
  {
    ai: env.AI_PROVIDER,
    models: env.AI_PROVIDER === 'gemini' ? env.GEMINI_MODELS : undefined,
    rateLimitStore: redis ? 'redis' : 'memory',
  },
  'olive api ready',
);
