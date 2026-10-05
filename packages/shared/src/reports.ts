import { z } from 'zod';
import { DATE_KEY_REGEX } from './dates';
import { MARKER_KEYS, type MarkerKey, type MarkerStatus, type Range } from './markers';

const markerInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.number().finite(),
  unit: z.string().trim().max(20),
  refLow: z.number().finite().nullable(),
  refHigh: z.number().finite().nullable(),
});
export type MarkerInput = z.infer<typeof markerInputSchema>;

/** What the AI extracted. Values are exactly as printed so the user can check them against the paper. */
export const reportDraftSchema = z.object({
  isLabReport: z.boolean(),
  labName: z.string().nullable(),
  reportDate: z.string().regex(DATE_KEY_REGEX).nullable(),
  markers: z.array(markerInputSchema),
  message: z.string().optional(),
});
export type ReportDraft = z.infer<typeof reportDraftSchema>;

export const createReportSchema = z.object({
  title: z.string().trim().min(1).max(80),
  reportDate: z.string().regex(DATE_KEY_REGEX),
  markers: z.array(markerInputSchema).min(1, 'Keep at least one value').max(150),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export interface ReportMarker extends MarkerInput {
  id: string;
  /** Catalog key when Olive knows how to track this marker. */
  key: MarkerKey | null;
  /** Value in the catalog's canonical unit (null if untracked or unit unknown). */
  canonicalValue: number | null;
  status: MarkerStatus | null;
}

export interface ReportSummary {
  id: string;
  title: string;
  reportDate: string;
  createdAt: string;
  markerCount: number;
  flaggedCount: number;
}

export interface Report extends Omit<ReportSummary, 'markerCount' | 'flaggedCount'> {
  markers: ReportMarker[];
}

export interface MarkerTrend {
  key: MarkerKey;
  name: string;
  unit: string;
  range: Range;
  latest: { value: number; status: MarkerStatus; date: string; reportId: string };
  /** Oldest first. */
  history: { date: string; value: number; reportId: string }[];
  tip: string | null;
}

export const markerKeySchema = z.enum(MARKER_KEYS);
