import {
  addDays,
  deriveNutritionFocus,
  lastNDays,
  sumNutrients,
  type DaySummary,
  type DateKey,
  type FocusProgress,
  type Insight,
  type NutritionFocus,
  type Nutrients,
  type Trends,
  type User,
} from '@sparshtomar/olive-shared';
import type { MealService } from '../meals';
import type { ReportService } from '../reports';
import { INSIGHT_WINDOW_DAYS, buildDayStats } from './insights/context';
import type { InsightEngine } from './insights/engine';

/** Read-side service: combines meals, goals and reports into "how am I doing?". */
export class ProgressService {
  constructor(
    private readonly meals: MealService,
    private readonly reports: ReportService,
    private readonly insightEngine: InsightEngine,
  ) {}

  async day(user: User, date: DateKey): Promise<DaySummary> {
    const [meals, focus] = await Promise.all([this.meals.listByDate(user.id, date), this.focus(user.id)]);
    const totals = sumNutrients(meals.map((m) => m.totals));
    return { date, targets: user.targets, totals, meals, focus: withProgress(focus, totals) };
  }

  async trends(user: User, end: DateKey, days: number): Promise<Trends> {
    const range = lastNDays(end, days);
    const [rows, loggedDates] = await Promise.all([
      this.meals.slotTotals(user.id, range[0]!, end),
      this.meals.loggedDates(user.id, end, 366),
    ]);
    const caloriesByDate = new Map<string, number>();
    for (const r of rows) caloriesByDate.set(r.date, (caloriesByDate.get(r.date) ?? 0) + r.calories);

    return {
      days: range.map((date) => ({
        date,
        calories: Math.round(caloriesByDate.get(date) ?? 0),
        target: user.targets.calories,
        logged: caloriesByDate.has(date),
      })),
      streak: streakEndingAt(end, loggedDates),
    };
  }

  async insights(user: User, today: DateKey): Promise<Insight[]> {
    const from = addDays(today, -INSIGHT_WINDOW_DAYS);
    const [rows, focus] = await Promise.all([this.meals.slotTotals(user.id, from, today), this.focus(user.id)]);
    return this.insightEngine.run({
      goalType: user.goalType,
      targets: user.targets,
      focus,
      days: buildDayStats(rows, today),
    });
  }

  private async focus(userId: string): Promise<NutritionFocus[]> {
    return deriveNutritionFocus(await this.reports.latestStatuses(userId));
  }
}

const withProgress = (focus: NutritionFocus[], totals: Nutrients): FocusProgress[] =>
  focus.map((f) => ({ ...f, consumed: Math.round(totals[f.nutrient] * 10) / 10 }));

/**
 * Consecutive logged days ending today. If today has nothing yet the streak isn't
 * broken — the day isn't over — so counting starts from yesterday.
 */
export const streakEndingAt = (today: DateKey, loggedDatesDesc: DateKey[]): number => {
  const logged = new Set(loggedDatesDesc);
  let cursor = logged.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (logged.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
};
