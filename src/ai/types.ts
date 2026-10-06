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

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantInput {
  /** Everything the assistant may ground its answer in: profile, targets, today's meals, lab markers. Plain text. */
  context: string;
  /** Earlier turns of this conversation, oldest first. */
  history: AssistantTurn[];
  text: string;
  image?: BinaryInput;
}

/** Answers a health question in Olive's voice, grounded in the user's own data. Returns plain prose. */
export interface HealthAssistant {
  reply(input: AssistantInput): Promise<string>;
}

export interface AiServices {
  mealAnalyzer: MealAnalyzer;
  reportExtractor: ReportExtractor;
  healthAssistant: HealthAssistant;
}
