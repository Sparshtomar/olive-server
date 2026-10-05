import { DATE_KEY_REGEX, type FoodItem, type MealDraft, type ReportDraft } from '@sparshtomar/olive-shared';
import type { AiMeal, AiReport } from './schemas';

const clamp = (v: number, max: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);
const round1 = (v: number) => Math.round(v * 10) / 10;
const nonEmpty = (s: string) => (s.trim() ? s.trim() : undefined);

/** Clamps model output into the domain's ranges and reshapes it into a draft. */
export const toMealDraft = (ai: AiMeal): MealDraft => {
  const items: FoodItem[] = ai.items
    .filter((i) => i.name.trim())
    .slice(0, 30)
    .map((i) => ({
      name: i.name.trim().slice(0, 80),
      portion: (i.portion.trim() || '1 serving').slice(0, 60),
      grams: Math.round(clamp(i.grams, 5000)),
      quantity: 1,
      confidence: i.confidence,
      nutrients: {
        calories: Math.round(clamp(i.calories, 5000)),
        protein: round1(clamp(i.protein, 500)),
        carbs: round1(clamp(i.carbs, 1000)),
        fat: round1(clamp(i.fat, 500)),
        fiber: round1(clamp(i.fiber, 200)),
        sugar: round1(clamp(i.sugar, 500)),
        saturatedFat: round1(clamp(i.saturatedFat, 300)),
        sodiumMg: Math.round(clamp(i.sodiumMg, 20000)),
      },
    }));

  const isFood = ai.isFood && items.length > 0;
  return {
    isFood,
    title: (ai.title.trim() || items.map((i) => i.name).join(', ')).slice(0, 80),
    items: isFood ? items : [],
    transcript: nonEmpty(ai.transcript),
    message: nonEmpty(ai.message),
  };
};

/** `latestValidDate` guards against misread dates; pass "tomorrow" to absorb timezone differences. */
export const toReportDraft = (ai: AiReport, latestValidDate: string): ReportDraft => {
  const markers = ai.markers
    .filter((m) => m.name.trim() && Number.isFinite(m.value))
    .slice(0, 150)
    .map((m) => ({
      name: m.name.trim().slice(0, 80),
      value: m.value,
      unit: m.unit.trim().slice(0, 20),
      refLow: m.refLow ?? null,
      refHigh: m.refHigh ?? null,
    }));

  // Lab dates in the future are misreads; let the user pick instead.
  const date = DATE_KEY_REGEX.test(ai.reportDate) && ai.reportDate <= latestValidDate ? ai.reportDate : null;

  return {
    isLabReport: ai.isLabReport && markers.length > 0,
    labName: nonEmpty(ai.labName) ?? null,
    reportDate: date,
    markers,
    message: nonEmpty(ai.message),
  };
};
