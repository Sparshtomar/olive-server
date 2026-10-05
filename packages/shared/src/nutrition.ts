import type { ActivityLevel, ProfileInput, Sex } from './profile';

/** Nutrients tracked per food item. Values are for the item's base portion. */
export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  saturatedFat: number;
  sodiumMg: number;
}

export type NutrientKey = keyof Nutrients;

export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string }> = {
  calories: { label: 'Calories', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Carbs', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
  fiber: { label: 'Fiber', unit: 'g' },
  sugar: { label: 'Sugar', unit: 'g' },
  saturatedFat: { label: 'Saturated fat', unit: 'g' },
  sodiumMg: { label: 'Sodium', unit: 'mg' },
};

export const emptyNutrients = (): Nutrients => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  saturatedFat: 0,
  sodiumMg: 0,
});

export const scaleNutrients = (n: Nutrients, factor: number): Nutrients => {
  const out = emptyNutrients();
  for (const key of Object.keys(out) as NutrientKey[]) out[key] = n[key] * factor;
  return out;
};

export const sumNutrients = (list: Nutrients[]): Nutrients =>
  list.reduce((acc, n) => {
    for (const key of Object.keys(acc) as NutrientKey[]) acc[key] += n[key];
    return acc;
  }, emptyNutrients());

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABEL: Record<ActivityLevel, { title: string; hint: string }> = {
  sedentary: { title: 'Mostly sitting', hint: 'Desk job, little exercise' },
  light: { title: 'Lightly active', hint: 'Walks, exercise 1–3 days a week' },
  moderate: { title: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  active: { title: 'Very active', hint: 'Hard exercise 6–7 days a week' },
  very_active: { title: 'Athlete', hint: 'Physical job or training twice a day' },
};

/** 1 kg of body fat ≈ 7700 kcal. */
const KCAL_PER_KG = 7700;
const MIN_CALORIES: Record<Sex, number> = { female: 1200, male: 1500 };

export interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Explains the math so the UI can show "why this number". */
  breakdown: {
    bmr: number;
    tdee: number;
    adjustment: number;
    /** True when the safety floor raised the target above the requested deficit. */
    clampedToMinimum: boolean;
  };
}

/** Mifflin-St Jeor BMR. */
export const basalMetabolicRate = (p: Pick<ProfileInput, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number =>
  10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);

export const computeTargets = (p: ProfileInput): DailyTargets => {
  const bmr = basalMetabolicRate(p);
  const tdee = bmr * ACTIVITY_FACTOR[p.activityLevel];
  const dailyDelta = (p.paceKgPerWeek * KCAL_PER_KG) / 7;
  const adjustment = p.goalType === 'lose' ? -dailyDelta : p.goalType === 'gain' ? dailyDelta : 0;

  const requested = tdee + adjustment;
  const floor = MIN_CALORIES[p.sex];
  const calories = roundTo(Math.max(requested, floor), 10);

  // Protein scales with body weight: above the 0.8–1 g/kg RDA, higher when cutting
  // (preserves muscle) or gaining, but reachable on a mostly vegetarian diet.
  // Fat at 30% of energy; carbs fill the rest.
  const proteinPerKg = p.goalType === 'lose' ? 1.4 : p.goalType === 'gain' ? 1.6 : 1.1;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.3) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    calories,
    protein,
    carbs,
    fat,
    breakdown: {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      adjustment: Math.round(adjustment),
      clampedToMinimum: requested < floor,
    },
  };
};

/** A pace above ~1% of body weight per week is hard to sustain. */
export const isAggressivePace = (p: Pick<ProfileInput, 'weightKg' | 'paceKgPerWeek' | 'goalType'>): boolean =>
  p.goalType !== 'maintain' && p.paceKgPerWeek > p.weightKg * 0.01;

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
