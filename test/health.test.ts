import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createContainer } from '../src/container';
import { createDb } from '../src/db/client';
import { createTestContext, FakeAi, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await createTestContext()));
afterAll(() => t.close());

describe('health', () => {
  it('is ok when the database answers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: 'ok' });
  });

  it('reports 503 when the database does not answer, so the platform stops routing here', async () => {
    const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
    const app = await buildApp({
      container: createContainer(db, new FakeAi()),
      corsOrigin: true,
      rateLimit: false,
      ping: () => Promise.reject(new Error('connection refused')),
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, db: 'down' });
    await app.close();
    await close();
  });
});
