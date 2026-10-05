import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { USER_ID_HEADER, type DaySummary, type ReportSummary, type Trends, type User } from '@sparshtomar/olive-shared';
import { createTestContext, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => (t = await createTestContext()));
afterAll(() => t.close());

const TODAY = '2026-10-04';

const createDemo = async (hour: number) => {
  const res = await t.app.inject({
    method: 'POST',
    url: '/users/demo',
    payload: { today: TODAY, hour, utcOffsetMinutes: 330 },
  });
  expect(res.statusCode).toBe(201);
  const user = res.json<User>();
  return { user, headers: { [USER_ID_HEADER]: user.id } };
};

describe('demo users', () => {
  it('creates a fresh, isolated user per request', async () => {
    const a = await createDemo(21);
    const b = await createDemo(21);
    expect(a.user.isDemo).toBe(true);
    expect(a.user.id).not.toBe(b.user.id);
  });

  it('seeds two weeks of meals with one forgotten day, and two lab reports', async () => {
    const { headers } = await createDemo(23);

    const trends = await t.app.inject({ method: 'GET', url: `/trends?end=${TODAY}&days=14`, headers });
    const { days } = trends.json<Trends>();
    expect(days).toHaveLength(14);
    expect(days.filter((d) => d.logged)).toHaveLength(13);

    const reports = await t.app.inject({ method: 'GET', url: '/reports', headers });
    expect(reports.json<ReportSummary[]>()).toHaveLength(2);
  });

  it("stops today's meals at the device's current hour", async () => {
    const { headers } = await createDemo(9);
    const day = await t.app.inject({ method: 'GET', url: `/days/${TODAY}`, headers });
    const { meals } = day.json<DaySummary>();
    expect(meals.every((m) => m.slot === 'breakfast')).toBe(true);
  });
});
