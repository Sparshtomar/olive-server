import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JPEG, createTestContext, item, mealInput, multipart, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

describe('identity', () => {
  it('rejects requests without a known user', async () => {
    const missing = await t.app.inject({ method: 'GET', url: '/me' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('UNKNOWN_USER');

    const stale = await t.app.inject({
      method: 'GET',
      url: '/me',
      headers: { 'x-olive-user': '00000000-0000-4000-8000-000000000000' },
    });
    expect(stale.json().error.code).toBe('UNKNOWN_USER');
  });

  it('validates onboarding input with field-level messages', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/users', payload: { name: '', sex: 'male' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
  });

  it('keeps goal and pace consistent on partial updates', async () => {
    const { headers } = await t.newUser();
    const bad = await t.app.inject({ method: 'PATCH', url: '/me', headers, payload: { goalType: 'maintain' } });
    expect(bad.statusCode).toBe(400);

    const ok = await t.app.inject({
      method: 'PATCH',
      url: '/me',
      headers,
      payload: { goalType: 'maintain', paceKgPerWeek: 0 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().targets.breakdown.adjustment).toBe(0);
  });
});

describe('analyzing meals', () => {
  it('returns a draft without saving anything', async () => {
    const { headers } = await t.newUser();
    const res = await t.app.inject({
      method: 'POST',
      url: '/meals/analyze/text',
      headers,
      payload: { text: '2 rotis and dal' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);

    const day = await t.app.inject({ method: 'GET', url: '/days/2026-10-04', headers });
    expect(day.json().meals).toHaveLength(0);
  });

  it('explains when there is no food', async () => {
    const { headers } = await t.newUser();
    t.ai.mealDraft = { isFood: false, title: '', items: [], message: 'That looks like a cat.' };
    const res = await t.app.inject({
      method: 'POST',
      url: '/meals/analyze/text',
      headers,
      payload: { text: 'my cat' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'NOT_FOOD', message: 'That looks like a cat.' });
    t.ai.mealDraft = { isFood: true, title: 'Dal', items: [item()] };
  });

  it('accepts photos by content, not by declared type', async () => {
    const { headers } = await t.newUser();
    const photo = multipart(JPEG, 'meal.bin', 'application/octet-stream', { caption: 'no ghee' });
    const ok = await t.app.inject({
      method: 'POST',
      url: '/meals/analyze/photo',
      headers: { ...headers, ...photo.headers },
      payload: photo.payload,
    });
    expect(ok.statusCode).toBe(200);
    expect(t.ai.lastMealInput).toMatchObject({ kind: 'photo', mimeType: 'image/jpeg', caption: 'no ghee' });

    const fake = multipart(Buffer.from('not an image'), 'meal.jpg', 'image/jpeg');
    const bad = await t.app.inject({
      method: 'POST',
      url: '/meals/analyze/photo',
      headers: { ...headers, ...fake.headers },
      payload: fake.payload,
    });
    expect(bad.statusCode).toBe(415);
    expect(bad.json().error.code).toBe('UNSUPPORTED_FILE');
  });
});

describe('saving meals', () => {
  it('is idempotent on clientId (double taps and retries)', async () => {
    const { headers } = await t.newUser();
    const input = mealInput();
    const first = await t.app.inject({ method: 'POST', url: '/meals', headers, payload: input });
    const second = await t.app.inject({ method: 'POST', url: '/meals', headers, payload: input });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);

    const day = await t.app.inject({ method: 'GET', url: '/days/2026-10-04', headers });
    expect(day.json().meals).toHaveLength(1);
  });

  it('scales nutrients by quantity in day totals', async () => {
    const { headers } = await t.newUser();
    await t.app.inject({
      method: 'POST',
      url: '/meals',
      headers,
      payload: mealInput({ items: [item({ quantity: 2 }), item({ quantity: 0.5 })] }),
    });
    const day = (await t.app.inject({ method: 'GET', url: '/days/2026-10-04', headers })).json();
    expect(day.totals.calories).toBe(500);
    expect(day.totals.protein).toBe(25);
  });

  it("edits and deletes, and never touches another user's meal", async () => {
    const owner = await t.newUser();
    const other = await t.newUser();
    const meal = (
      await t.app.inject({ method: 'POST', url: '/meals', headers: owner.headers, payload: mealInput() })
    ).json();

    const hijack = await t.app.inject({ method: 'DELETE', url: `/meals/${meal.id}`, headers: other.headers });
    expect(hijack.statusCode).toBe(404);

    const edited = await t.app.inject({
      method: 'PATCH',
      url: `/meals/${meal.id}`,
      headers: owner.headers,
      payload: { slot: 'dinner', items: [item({ name: 'Rajma', quantity: 1.5 })] },
    });
    expect(edited.json()).toMatchObject({ slot: 'dinner', items: [{ name: 'Rajma', quantity: 1.5 }] });
    expect(edited.json().totals.calories).toBe(300);

    const del = await t.app.inject({ method: 'DELETE', url: `/meals/${meal.id}`, headers: owner.headers });
    expect(del.statusCode).toBe(204);
  });

  it('stores a photo and serves it back', async () => {
    const { headers } = await t.newUser();
    const meal = (
      await t.app.inject({
        method: 'POST',
        url: '/meals',
        headers,
        payload: mealInput({ source: 'photo', photoBase64: JPEG.toString('base64') }),
      })
    ).json();
    expect(meal.photoUrl).toBe(`/meals/${meal.id}/photo`);
    const photo = await t.app.inject({ method: 'GET', url: meal.photoUrl });
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.rawPayload.equals(JPEG)).toBe(true);
  });

  it('rejects an empty meal', async () => {
    const { headers } = await t.newUser();
    const res = await t.app.inject({ method: 'POST', url: '/meals', headers, payload: mealInput({ items: [] }) });
    expect(res.statusCode).toBe(400);
  });
});

describe('trends', () => {
  it('fills empty days and keeps the streak alive while today is still empty', async () => {
    const { headers } = await t.newUser();
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      await t.app.inject({ method: 'POST', url: '/meals', headers, payload: mealInput({ date }) });
    }
    const res = (await t.app.inject({ method: 'GET', url: '/trends?end=2026-10-04&days=7', headers })).json();
    expect(res.days).toHaveLength(7);
    expect(res.days.at(-1)).toMatchObject({ date: '2026-10-04', logged: false, calories: 0 });
    expect(res.streak).toBe(3);
  });
});
