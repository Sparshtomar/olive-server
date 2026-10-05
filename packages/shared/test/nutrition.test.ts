import { describe, expect, it } from 'vitest';
import { computeTargets, isAggressivePace, type ProfileInput } from '../src';

const base: ProfileInput = {
  name: 'Asha',
  sex: 'female',
  age: 30,
  heightCm: 165,
  weightKg: 70,
  activityLevel: 'light',
  goalType: 'lose',
  paceKgPerWeek: 0.5,
};

describe('computeTargets', () => {
  it('applies Mifflin-St Jeor, activity factor and a 0.5 kg/week deficit', () => {
    const t = computeTargets(base);
    // BMR = 700 + 1031.25 - 150 - 161 = 1420.25; TDEE = ×1.375 = 1952.8; −550/day
    expect(t.breakdown.bmr).toBe(1420);
    expect(t.breakdown.tdee).toBe(1953);
    expect(t.breakdown.adjustment).toBe(-550);
    expect(t.calories).toBe(1400);
    expect(t.breakdown.clampedToMinimum).toBe(false);
  });

  it('never goes below the safety floor', () => {
    const t = computeTargets({ ...base, weightKg: 45, heightCm: 150, activityLevel: 'sedentary', paceKgPerWeek: 0.75 });
    expect(t.calories).toBe(1200);
    expect(t.breakdown.clampedToMinimum).toBe(true);
  });

  it('adds a surplus for gain and nothing for maintain', () => {
    const maintain = computeTargets({ ...base, goalType: 'maintain', paceKgPerWeek: 0 });
    const gain = computeTargets({ ...base, goalType: 'gain', paceKgPerWeek: 0.25 });
    expect(maintain.breakdown.adjustment).toBe(0);
    expect(gain.calories).toBeGreaterThan(maintain.calories);
  });

  it('keeps macros consistent with the calorie target', () => {
    const t = computeTargets(base);
    const kcal = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(kcal - t.calories)).toBeLessThan(15);
  });
});

describe('isAggressivePace', () => {
  it('flags paces above 1% of body weight per week', () => {
    expect(isAggressivePace({ weightKg: 50, paceKgPerWeek: 0.75, goalType: 'lose' })).toBe(true);
    expect(isAggressivePace({ weightKg: 90, paceKgPerWeek: 0.75, goalType: 'lose' })).toBe(false);
    expect(isAggressivePace({ weightKg: 50, paceKgPerWeek: 0, goalType: 'maintain' })).toBe(false);
  });
});
