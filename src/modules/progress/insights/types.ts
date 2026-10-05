import type { Insight } from '@sparshtomar/olive-shared';
import type { InsightContext } from './context';

export interface ScoredInsight extends Insight {
  /** Higher shows first. Roughly: 100 = act on this today, 10 = nice to know. */
  score: number;
}

/**
 * One self-contained observation about the user's habits. Rules are pure functions
 * of the context, so each is unit-testable and new ones plug in without touching the engine.
 */
export interface InsightRule {
  readonly id: string;
  evaluate(ctx: InsightContext): ScoredInsight | null;
}
