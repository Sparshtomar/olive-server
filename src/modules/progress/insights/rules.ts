import { MEAL_SLOT_LABEL, NUTRIENT_META, type MealSlot } from '@sparshtomar/olive-shared';
import type { DayStats, InsightContext } from './context';
import type { InsightRule } from './types';

/** Insights look at the last week; the 14-day window is only for week-over-week rules. */
const recentLogged = (ctx: InsightContext, days = 7): DayStats[] => ctx.days.slice(-days).filter((d) => d.logged);

const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const g = (n: number) => `${Math.round(n)} g`;

export const MIN_LOGGED_DAYS = 3;

/** Shown alone until there's enough history for patterns to mean anything. */
export const warmingUp: InsightRule = {
  id: 'warming-up',
  evaluate(ctx) {
    const logged = recentLogged(ctx).length;
    if (logged >= MIN_LOGGED_DAYS) return null;
    const left = MIN_LOGGED_DAYS - logged;
    return {
      id: this.id,
      tone: 'info',
      title: 'Olive is getting to know you',
      body: `Log meals on ${left} more ${left === 1 ? 'day' : 'days'} and Olive will start spotting patterns in your eating.`,
      score: 1000,
    };
  },
};

export const proteinGap: InsightRule = {
  id: 'protein-gap',
  evaluate(ctx) {
    const days = recentLogged(ctx);
    const average = avg(days.map((d) => d.totals.protein));
    const ratio = average / ctx.targets.protein;
    if (ratio >= 0.8) return null;
    return {
      id: this.id,
      tone: 'nudge',
      title: 'Protein is running low',
      body: `You averaged ${g(average)} a day against a ${g(ctx.targets.protein)} target. Eggs, dal, paneer, curd or sprouts at breakfast is the easiest fix.`,
      score: 60 + (1 - ratio) * 40,
    };
  },
};

export const calorieOvershoot: InsightRule = {
  id: 'calorie-overshoot',
  evaluate(ctx) {
    if (ctx.goalType === 'gain') return null;
    const days = recentLogged(ctx);
    const over = days.filter((d) => d.totals.calories > ctx.targets.calories * 1.1);
    if (days.length < MIN_LOGGED_DAYS || over.length < Math.ceil(days.length / 2)) return null;
    const excess = avg(over.map((d) => d.totals.calories - ctx.targets.calories));
    const heaviest = heaviestSlot(over);
    return {
      id: this.id,
      tone: 'nudge',
      title: `Over target on ${over.length} of ${days.length} days`,
      body: `By about ${Math.round(excess)} kcal on those days.${heaviest ? ` ${MEAL_SLOT_LABEL[heaviest.slot]} made up ${pct(heaviest.share)} of it — a smaller ${MEAL_SLOT_LABEL[heaviest.slot].toLowerCase()} is the simplest lever.` : ''}`,
      score: 70 + (over.length / days.length) * 20,
    };
  },
};

export const underEating: InsightRule = {
  id: 'under-eating',
  evaluate(ctx) {
    const days = recentLogged(ctx).filter((d) => d.totals.calories > 0);
    if (days.length < MIN_LOGGED_DAYS) return null;
    const ratio = avg(days.map((d) => d.totals.calories)) / ctx.targets.calories;
    if (ratio >= 0.7) return null;
    return {
      id: this.id,
      tone: 'nudge',
      title: 'Eating well below your target',
      body: `You're averaging ${pct(ratio)} of your daily target. If that's not just missed logs, eating this little tends to backfire with cravings and muscle loss.`,
      score: 65,
    };
  },
};

export const steadyWeek: InsightRule = {
  id: 'steady-week',
  evaluate(ctx) {
    const days = recentLogged(ctx);
    const { calories } = ctx.targets;
    const onTarget = days.filter((d) =>
      ctx.goalType === 'gain'
        ? d.totals.calories >= calories * 0.95
        : d.totals.calories <= calories * 1.05 && d.totals.calories >= calories * 0.7,
    );
    if (onTarget.length < 4) return null;
    return {
      id: this.id,
      tone: 'positive',
      title: `On target ${onTarget.length} of the last 7 days`,
      body: 'This kind of consistency is what actually moves the scale. Keep the routine that got you here.',
      score: 40 + onTarget.length * 3,
    };
  },
};

export const consistentLogging: InsightRule = {
  id: 'consistent-logging',
  evaluate(ctx) {
    const logged = recentLogged(ctx).length;
    if (logged < 6) return null;
    return {
      id: this.id,
      tone: 'positive',
      title: logged === 7 ? 'Every day logged this week' : `${logged} of 7 days logged`,
      body: 'People who log consistently are far more likely to reach their goal. The habit is the hard part — you have it.',
      score: 38,
    };
  },
};

export const heavyDinners: InsightRule = {
  id: 'heavy-dinners',
  evaluate(ctx) {
    const days = recentLogged(ctx).filter((d) => d.totals.calories > 0);
    if (days.length < MIN_LOGGED_DAYS) return null;
    const share = avg(days.map((d) => d.bySlot.dinner.calories / d.totals.calories));
    if (share < 0.45) return null;
    return {
      id: this.id,
      tone: 'info',
      title: 'Dinner carries your day',
      body: `${pct(share)} of your calories come at dinner. Moving some of that to lunch keeps energy steadier and often helps sleep.`,
      score: 35,
    };
  },
};

export const weekendEffect: InsightRule = {
  id: 'weekend-effect',
  evaluate(ctx) {
    const days = ctx.days.filter((d) => d.logged && d.totals.calories > 0);
    const weekend = days.filter((d) => d.isWeekend);
    const weekday = days.filter((d) => !d.isWeekend);
    if (weekend.length < 2 || weekday.length < 3) return null;
    const we = avg(weekend.map((d) => d.totals.calories));
    const wd = avg(weekday.map((d) => d.totals.calories));
    if (we < wd * 1.2) return null;
    return {
      id: this.id,
      tone: 'info',
      title: 'Weekends run heavier',
      body: `You eat about ${Math.round(we - wd)} kcal more on weekend days. Planning one relaxed meal instead of a relaxed weekend keeps the week's progress.`,
      score: 30,
    };
  },
};

/** Ties daily food to lab results: one insight per report-driven nutrient focus. */
export const reportFocus: InsightRule = {
  id: 'report-focus',
  evaluate(ctx) {
    const days = recentLogged(ctx);
    if (days.length < MIN_LOGGED_DAYS || ctx.focus.length === 0) return null;

    const results = ctx.focus.map((f) => {
      const met = days.filter((d) =>
        f.kind === 'max' ? d.totals[f.nutrient] <= f.amount : d.totals[f.nutrient] >= f.amount,
      ).length;
      return { focus: f, met, rate: met / days.length };
    });
    // Speak to the weakest area — that's where the next improvement is.
    const worst = results.sort((a, b) => a.rate - b.rate)[0]!;
    const { focus, met } = worst;
    const label = NUTRIENT_META[focus.nutrient].label.toLowerCase();
    const unit = NUTRIENT_META[focus.nutrient].unit;
    const goal = `${focus.kind === 'max' ? 'under' : 'at least'} ${focus.amount} ${unit} a day`;
    const markers = listJoin(focus.reasons.map((r, i) => (i === 0 ? r.name : lowerFirst(r.name))));

    if (worst.rate >= 0.7) {
      return {
        id: `${this.id}-${focus.nutrient}`,
        tone: 'positive',
        title: `${capitalize(label)} on track`,
        body: `You kept ${label} ${goal} on ${met} of ${days.length} days — exactly what your ${markers} need. It'll show in your next report.`,
        score: 55,
      };
    }
    return {
      id: `${this.id}-${focus.nutrient}`,
      tone: 'nudge',
      title: `Your report says: watch ${label}`,
      body: `${markers} ${focus.reasons.length > 1 ? 'are' : 'is'} out of range. Keeping ${label} ${goal} helps — you managed it on ${met} of ${days.length} days.`,
      score: 85,
    };
  },
};

export const DEFAULT_RULES: InsightRule[] = [
  warmingUp,
  reportFocus,
  calorieOvershoot,
  underEating,
  proteinGap,
  steadyWeek,
  consistentLogging,
  heavyDinners,
  weekendEffect,
];

const heaviestSlot = (days: DayStats[]): { slot: MealSlot; share: number } | null => {
  const total = days.reduce((s, d) => s + d.totals.calories, 0);
  if (!total) return null;
  const shares = (Object.keys(days[0]!.bySlot) as MealSlot[]).map((slot) => ({
    slot,
    share: days.reduce((s, d) => s + d.bySlot[slot].calories, 0) / total,
  }));
  return shares.sort((a, b) => b.share - a.share)[0] ?? null;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Keeps acronyms (LDL, HbA1c, TSH) intact while lowering ordinary words. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]+(\s|$)/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const listJoin = (parts: string[]) =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
