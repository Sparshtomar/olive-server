import type { MealDraft, ReportDraft } from '@sparshtomar/olive-shared';

export interface BinaryInput {
  data: Buffer;
  mimeType: string;
}

export type MealInput =
  | ({ kind: 'photo'; caption?: string } & BinaryInput)
  | ({ kind: 'voice' } & BinaryInput)
  | { kind: 'text'; text: string };

/**
 * Turns a photo, voice note or sentence into a structured meal draft.
 * Implementations must return schema-valid drafts or throw an AppError.
 */
export interface MealAnalyzer {
  analyze(input: MealInput): Promise<MealDraft>;
}

/** Extracts lab values from a PDF or photo of a lab report. */
export interface ReportExtractor {
  extract(file: BinaryInput): Promise<ReportDraft>;
}

export interface AiServices {
  mealAnalyzer: MealAnalyzer;
  reportExtractor: ReportExtractor;
}
