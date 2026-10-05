import { randomUUID } from 'node:crypto';
import { addDays, fromDateKey, type DateKey, type MealSlot, type User } from '@sparshtomar/olive-shared';
import type { MealService } from '../meals';
import type { ReportService } from '../reports';
import type { UserService } from '../users';
import { DEMO_PROFILE, DEMO_REPORTS, MEAL_OPTIONS, WEEKEND_TREATS } from './demo.data';

export interface DemoClock {
  /** The device's local date. */
  today: DateKey;
  /** The device's local hour (0–23) — today's meals stop at "now". */
  hour: number;
  /** Device offset from UTC in minutes (e.g. +330 for IST). */
  utcOffsetMinutes: number;
}

const HISTORY_DAYS = 13;
const SLOT_TIME: Record<MealSlot, [number, number]> = {
  breakfast: [8, 40],
  lunch: [13, 20],
  snack: [17, 10],
  dinner: [20, 45],
};

/**
 * Creates a fresh demo user with two weeks of meals and two lab reports, so anyone
 * can feel the whole product in seconds. Each tap creates a new user (instead of
 * sharing one) so reviewers never see each other's edits.
 */
export class DemoService {
  constructor(
    private readonly users: UserService,
    private readonly meals: MealService,
    private readonly reports: ReportService,
  ) {}

  async createDemoUser(clock: DemoClock): Promise<User> {
    const user = await this.users.create(DEMO_PROFILE, { isDemo: true });
    const random = seeded(42);

    for (let ago = HISTORY_DAYS; ago >= 0; ago--) {
      const date = addDays(clock.today, -ago);
      if (ago === 9) continue; // a forgotten day — real logs have gaps
      const weekday = fromDateKey(date).getDay();
      const isWeekend = weekday === 0 || weekday === 6;

      for (const slot of Object.keys(MEAL_OPTIONS) as MealSlot[]) {
        if (ago === 0 && SLOT_TIME[slot][0] > clock.hour) continue;
        if (slot === 'snack' && random() < 0.4) continue;
        if (slot === 'breakfast' && random() < 0.15) continue;

        const treat = isWeekend ? WEEKEND_TREATS.find((t) => t.slot === slot) : undefined;
        const options = MEAL_OPTIONS[slot];
        const meal = treat ?? options[Math.floor(random() * options.length)]!;

        await this.meals.create(user.id, {
          clientId: randomUUID(),
          date,
          slot,
          source: (['photo', 'voice', 'text'] as const)[Math.floor(random() * 3)]!,
          title: meal.title,
          loggedAt: localTime(date, SLOT_TIME[slot], clock.utcOffsetMinutes),
          items: meal.items.map((i) => ({ ...i, quantity: random() < 0.2 ? 1.5 : 1 })),
        });
      }
    }

    for (const report of DEMO_REPORTS) {
      await this.reports.create(user.id, user.sex, {
        title: report.title,
        reportDate: addDays(clock.today, -Math.round(report.monthsAgo * 30)),
        markers: report.markers,
      });
    }
    return user;
  }
}

const localTime = (date: DateKey, [h, m]: [number, number], offsetMinutes: number): string => {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, m) - offsetMinutes * 60_000).toISOString();
};

/** mulberry32 — same demo every time, so screenshots and walkthroughs stay consistent. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
