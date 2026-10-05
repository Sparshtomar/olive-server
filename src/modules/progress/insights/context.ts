import {
  MEAL_SLOTS,
  fromDateKey,
  lastNDays,
  sumNutrients,
  type DailyTargets,
  type DateKey,
  type GoalType,
  type MealSlot,
  type NutritionFocus,
  type Nutrients,
} from '@sparshtomar/olive-shared';
import type { SlotTotals } from '../../meals';

export interface DayStats {
  date: DateKey;
  isWeekend: boolean;
  logged: boolean;
  totals: Nutrients;
  bySlot: Record<MealSlot, Nutrients>;
}

export interface InsightContext {
  goalType: GoalType;
  targets: DailyTargets;
  focus: NutritionFocus[];
  /**
   * Completed days only (today is still in progress and would skew averages),
   * oldest first, including days with nothing logged.
   */
  days: DayStats[];
}

export const INSIGHT_WINDOW_DAYS = 14;

/** Shapes per-slot SQL aggregates into a dense day-by-day series. */
export const buildDayStats = (rows: SlotTotals[], today: DateKey, windowDays = INSIGHT_WINDOW_DAYS): DayStats[] => {
  const yesterday = lastNDays(today, 2)[0]!;
  return lastNDays(yesterday, windowDays).map((date) => {
    const forDay = rows.filter((r) => r.date === date);
    const bySlot = Object.fromEntries(
      MEAL_SLOTS.map((slot) => [slot, sumNutrients(forDay.filter((r) => r.slot === slot))]),
    ) as Record<MealSlot, Nutrients>;
    const day = fromDateKey(date).getDay();
    return {
      date,
      isWeekend: day === 0 || day === 6,
      logged: forDay.some((r) => r.meals > 0),
      totals: sumNutrients(forDay),
      bySlot,
    };
  });
};
