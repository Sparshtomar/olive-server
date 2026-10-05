import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, mealInput, item, multipart, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const lipidReport = (reportDate: string, ldl: number, unit = 'mg/dL') => ({
  title: 'Lipid profile',
  reportDate,
  markers: [
    { name: 'LDL Cholesterol', value: ldl, unit, refLow: null, refHigh: 100 },
    { name: 'SGPT (ALT)', value: 30, unit: 'U/L', refLow: 0, refHigh: 45 },
  ],
});

describe('reports', () => {
  it('normalises markers, tracks trends across units and drives nutrition focus', async () => {
    const { headers } = await t.newUser();
    await t.app.inject({ method: 'POST', url: '/reports', headers, payload: lipidReport('2026-03-01', 4.1, 'mmol/L') });
    const second = await t.app.inject({
      method: 'POST',
      url: '/reports',
      headers,
      payload: lipidReport('2026-09-01', 128),
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().markers).toMatchObject([
      { key: 'ldl', canonicalValue: 128, status: 'high' },
      { key: null, canonicalValue: null, status: 'normal' },
    ]);

    const markers = (await t.app.inject({ method: 'GET', url: '/markers', headers })).json();
    expect(markers).toHaveLength(1);
    expect(markers[0].history.map((h: { value: number }) => h.value)).toEqual([159, 128]);
    expect(markers[0].tip).toBeTruthy();

    await t.app.inject({
      method: 'POST',
      url: '/meals',
      headers,
      payload: mealInput({ items: [item({ nutrients: { ...item().nutrients, saturatedFat: 9 } })] }),
    });
    const day = (await t.app.inject({ method: 'GET', url: '/days/2026-10-04', headers })).json();
    expect(day.focus).toContainEqual(
      expect.objectContaining({ nutrient: 'saturatedFat', kind: 'max', amount: 13, consumed: 9 }),
    );
  });

  it('lists newest first with flag counts, and deletes', async () => {
    const { headers } = await t.newUser();
    await t.app.inject({ method: 'POST', url: '/reports', headers, payload: lipidReport('2026-01-01', 90) });
    await t.app.inject({ method: 'POST', url: '/reports', headers, payload: lipidReport('2026-06-01', 140) });
    const list = (await t.app.inject({ method: 'GET', url: '/reports', headers })).json();
    expect(list.map((r: { reportDate: string }) => r.reportDate)).toEqual(['2026-06-01', '2026-01-01']);
    expect(list[0]).toMatchObject({ markerCount: 2, flaggedCount: 1 });

    const del = await t.app.inject({ method: 'DELETE', url: `/reports/${list[0].id}`, headers });
    expect(del.statusCode).toBe(204);
    const markers = (await t.app.inject({ method: 'GET', url: '/markers', headers })).json();
    expect(markers[0].latest.value).toBe(90);
  });

  it('refuses password-protected PDFs and non-reports with clear codes', async () => {
    const { headers } = await t.newUser();
    const locked = multipart(Buffer.from('%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>'), 'r.pdf', 'application/pdf');
    const res = await t.app.inject({
      method: 'POST',
      url: '/reports/analyze',
      headers: { ...headers, ...locked.headers },
      payload: locked.payload,
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.message).toMatch(/password/);

    t.ai.reportDraft = {
      isLabReport: false,
      labName: null,
      reportDate: null,
      markers: [],
      message: 'This is a receipt.',
    };
    const pdf = multipart(Buffer.from('%PDF-1.7\nhello'), 'r.pdf', 'application/pdf');
    const notReport = await t.app.inject({
      method: 'POST',
      url: '/reports/analyze',
      headers: { ...headers, ...pdf.headers },
      payload: pdf.payload,
    });
    expect(notReport.statusCode).toBe(422);
    expect(notReport.json().error).toMatchObject({ code: 'NOT_A_REPORT', message: 'This is a receipt.' });
  });
});
