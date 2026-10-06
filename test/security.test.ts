import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await createTestContext()));
afterAll(() => t.close());

describe('security headers', () => {
  it('sets the baseline helmet headers on every response', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
