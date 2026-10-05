import type { Part } from '@google/genai';
import { addDays, toDateKey, type MealDraft, type ReportDraft } from '@sparshtomar/olive-shared';
import type { BinaryInput, MealAnalyzer, MealInput, ReportExtractor } from '../types';
import { toMealDraft, toReportDraft } from './mappers';
import { MEAL_SYSTEM_PROMPT, REPORT_SYSTEM_PROMPT, mealUserPrompt } from './prompts';
import { aiMealSchema, aiReportSchema } from './schemas';
import type { GeminiStructuredClient } from './structured-client';

const inline = ({ data, mimeType }: BinaryInput): Part => ({ inlineData: { data: data.toString('base64'), mimeType } });

export class GeminiMealAnalyzer implements MealAnalyzer {
  constructor(private readonly client: GeminiStructuredClient) {}

  async analyze(input: MealInput): Promise<MealDraft> {
    const parts: Part[] =
      input.kind === 'text'
        ? [{ text: mealUserPrompt.text(input.text) }]
        : [
            inline(input),
            { text: input.kind === 'photo' ? mealUserPrompt.photo(input.caption) : mealUserPrompt.voice() },
          ];

    const ai = await this.client.generate({ system: MEAL_SYSTEM_PROMPT, parts, schema: aiMealSchema });
    return toMealDraft(ai);
  }
}

export class GeminiReportExtractor implements ReportExtractor {
  constructor(private readonly client: GeminiStructuredClient) {}

  async extract(file: BinaryInput): Promise<ReportDraft> {
    const ai = await this.client.generate({
      system: REPORT_SYSTEM_PROMPT,
      parts: [inline(file), { text: 'Extract the lab results from this report.' }],
      schema: aiReportSchema,
      // Multi-page PDFs take longer than a meal photo.
      timeoutMs: 90_000,
    });
    return toReportDraft(ai, addDays(toDateKey(new Date()), 1));
  }
}
