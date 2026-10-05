import type { NutritionFocus } from './markers';
import type { Meal } from './meals';
import type { DailyTargets, Nutrients } from './nutrition';
import type { ProfileInput } from './profile';

export interface User extends ProfileInput {
  id: string;
  isDemo: boolean;
  targets: DailyTargets;
  createdAt: string;
}

export interface FocusProgress extends NutritionFocus {
  consumed: number;
}

export interface DaySummary {
  date: string;
  targets: DailyTargets;
  totals: Nutrients;
  meals: Meal[];
  focus: FocusProgress[];
}

export interface TrendDay {
  date: string;
  calories: number;
  target: number;
  logged: boolean;
}

export interface Trends {
  days: TrendDay[];
  /** Consecutive days with at least one meal, ending today (or yesterday if today is still empty). */
  streak: number;
}

export type InsightTone = 'positive' | 'nudge' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
}

/** Stable error codes the client maps to copy and recovery actions. */
export const ERROR_CODES = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_USER: 'UNKNOWN_USER',
  NOT_FOOD: 'NOT_FOOD',
  NOT_A_REPORT: 'NOT_A_REPORT',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  AI_BUSY: 'AI_BUSY',
  AI_FAILED: 'AI_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export const USER_ID_HEADER = 'x-olive-user';
