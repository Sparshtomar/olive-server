import { describe, expect, it } from 'vitest';
import { computeTargets, emptyNutrients, type MealSlot, type Nutrients } from '@sparshtomar/olive-shared';
import type { SlotTotals } from '../src/modules/meals/meal.repository';
import { buildDayStats, type InsightContext } from '../src/modules/progress/insights/context';
import { InsightEngine } from '../src/modules/progress/insights/engine';
import { calorieOvershoot, proteinGap, reportFocus, weekendEffect } from '../src/modules/progress/insights/rules';
import { streakEndingAt } from '../src/modules/progress/progress.service';
import { PROFILE } from './helpers';

const TODAY = '2026-10-04'; // a Sunday
const targets = computeTargets(PROFILE); // ≈ 2150 kcal, 112 g protein

const row = (date: string, slot: MealSlot, n: Partial<Nutrients>): SlotTotals => ({
  date,
  slot,
  meals: 1,
  ...emptyNutrients(),
  ...n,
});

/** One day = lunch + dinner splitting `calories` and `protein` 40/60. */
const day = (date: string, calories: number, extra: Partial<Nutrients> = {}): SlotTotals[] => [
  row(date, 'lunch', { calories: calories * 0.4, protein: (extra.protein ?? 120) * 0.4, ...half(extra) }),
  row(date, 'dinner', { calories: calories * 0.6, protein: (extra.protein ?? 120) * 0.6, ...half(extra) }),
];
const half = (n: Partial<Nutrients>) =>
  Object.fromEntries(
    Object.entries(n)
      .filter(([k]) => k !== 'protein')
      .map(([k, v]) => [k, v / 2]),
  );

const ctx = (rows: SlotTotals[], overrides: Partial<InsightContext> = {}): InsightContext => ({
  goalType: 'lose',
  targets,
  focus: [],
  days: buildDayStats(rows, TODAY),
  ...overrides,
});

const week = (calories: number, extra?: Partial<Nutrients>) =>
  ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].flatMap((d) =>
    day(d, calories, extra),
  );

describe('InsightEngine', () => {
  it('asks for more data before claiming patterns', () => {
    const insights = new InsightEngine().run(ctx(day('2026-10-03', 4000)));
    expect(insights).toHaveLength(1);
    expect(insights[0]!.id).toBe('warming-up');
    expect(insights[0]!.body).toMatch(/2 more days/);
  });

  it('ignores today (still in progress)', () => {
    const insights = new InsightEngine().run(ctx([...day(TODAY, 5000), ...day('2026-10-03', 2000)]));
    expect(insights[0]!.id).toBe('warming-up');
  });

  it('always keeps one positive insight when there is one', () => {
    const insights = new InsightEngine().run(ctx(week(3000, { protein: 40 })));
    expect(insights.some((i) => i.tone === 'positive')).toBe(true);
    expect(insights.map((i) => i.id)).toContain('calorie-overshoot');
  });
});

describe('rules', () => {
  it('calorie overshoot names the heaviest meal', () => {
    const result = calorieOvershoot.evaluate(ctx(week(3000)));
    expect(result?.title).toBe('Over target on 7 of 7 days');
    expect(result?.body).toMatch(/Dinner made up 60%/);
  });

  it('calorie overshoot stays quiet for a gain goal', () => {
    expect(calorieOvershoot.evaluate(ctx(week(3000), { goalType: 'gain' }))).toBeNull();
  });

  it('protein gap triggers under 80% of target', () => {
    expect(proteinGap.evaluate(ctx(week(2000, { protein: 60 })))).not.toBeNull();
    expect(proteinGap.evaluate(ctx(week(2000, { protein: 110 })))).toBeNull();
  });

  it('report focus praises adherence or nudges, naming the markers', () => {
    const focus = [
      {
        nutrient: 'saturatedFat' as const,
        kind: 'max' as const,
        amount: 13,
        reasons: [{ key: 'ldl' as const, name: 'LDL cholesterol', status: 'high' as const }],
      },
    ];
    const good = reportFocus.evaluate(ctx(week(2000, { saturatedFat: 10 }), { focus }));
    expect(good).toMatchObject({ tone: 'positive' });
    expect(good?.body).toMatch(/LDL cholesterol/);

    const bad = reportFocus.evaluate(ctx(week(2000, { saturatedFat: 20 }), { focus }));
    expect(bad).toMatchObject({ tone: 'nudge' });
    expect(bad?.body).toMatch(/0 of 7 days/);
  });

  it('weekend effect compares weekend and weekday averages', () => {
    const rows = [
      ...day('2026-09-29', 1800),
      ...day('2026-09-30', 1800),
      ...day('2026-10-01', 1800),
      ...day('2026-09-26', 2800), // Sat
      ...day('2026-09-27', 2800), // Sun
    ];
    expect(weekendEffect.evaluate(ctx(rows))?.body).toMatch(/1000 kcal more/);
  });
});

describe('streakEndingAt', () => {
  it('counts back from today, or from yesterday if today is still empty', () => {
    expect(streakEndingAt('2026-10-04', ['2026-10-04', '2026-10-03', '2026-10-01'])).toBe(2);
    expect(streakEndingAt('2026-10-04', ['2026-10-03', '2026-10-02'])).toBe(2);
    expect(streakEndingAt('2026-10-04', ['2026-10-01'])).toBe(0);
  });
});
