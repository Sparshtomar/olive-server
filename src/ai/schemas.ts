import { z } from 'zod';
import { CONFIDENCE_LEVELS } from '@sparshtomar/olive-shared';

/**
 * Schemas the *model* fills in. Deliberately looser and flatter than the API's
 * domain schemas (no max lengths, no nested objects) - models follow simple shapes
 * more reliably. `toMealDraft` / `toReportDraft` then clamp and reshape the result.
 */

const n = (description: string) => z.number().describe(description);

export const aiMealSchema = z.object({
  isFood: z.boolean().describe('false if the input contains no food or drink'),
  title: z
    .string()
    .describe('Short natural name for the whole meal, e.g. "Rajma chawal with salad". Empty if not food.'),
  message: z
    .string()
    .describe('If isFood is false: one friendly sentence saying what you saw/heard instead. Otherwise empty.'),
  transcript: z.string().describe('Voice input only: verbatim transcript of what was said. Otherwise empty.'),
  items: z.array(
    z.object({
      name: z.string().describe('Food name, e.g. "Butter roti"'),
      portion: z.string().describe('Human portion as eaten, e.g. "2 rotis", "1 katori (150 g)", "1 cup"'),
      grams: n('Total weight of the portion in grams'),
      calories: n('kcal for the whole portion'),
      protein: n('grams'),
      carbs: n('grams'),
      fat: n('grams'),
      fiber: n('grams'),
      sugar: n('grams'),
      saturatedFat: n('grams'),
      sodiumMg: n('milligrams'),
      confidence: z
        .enum(CONFIDENCE_LEVELS)
        .describe(
          'low when the food or portion is hard to tell (hidden ingredients, unclear photo, vague description)',
        ),
    }),
  ),
});
export type AiMeal = z.infer<typeof aiMealSchema>;

export const aiReportSchema = z.object({
  isLabReport: z.boolean().describe('false if this is not a medical lab test report'),
  message: z
    .string()
    .describe('If not a lab report or unreadable: one friendly sentence explaining why. Otherwise empty.'),
  labName: z.string().describe('Name of the lab or the panel (e.g. "Thyrocare - Lipid profile"). Empty if unknown.'),
  reportDate: z.string().describe('Sample collection date as YYYY-MM-DD, else report date. Empty if not printed.'),
  markers: z.array(
    z.object({
      name: z.string().describe('Test name exactly as printed'),
      value: n('Numeric result exactly as printed'),
      unit: z.string().describe('Unit exactly as printed, empty if none'),
      refLow: z.number().nullable().describe('Lower bound of the printed reference range, null if none'),
      refHigh: z.number().nullable().describe('Upper bound of the printed reference range, null if none'),
    }),
  ),
});
export type AiReport = z.infer<typeof aiReportSchema>;

/** The assistant's prose comes back inside JSON so it rides the same validation and fallback as everything else. */
export const replySchema = z.object({ reply: z.string().trim().min(1).max(4000) });
