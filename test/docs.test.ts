import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await createTestContext()));
afterAll(() => t.close());

describe('API docs', () => {
  it('publishes an OpenAPI spec generated from the route schemas', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/meals', '/reports', '/days/{date}', '/users/demo']),
    );
  });
});
