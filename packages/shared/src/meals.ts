import { z } from 'zod';
import { DATE_KEY_REGEX } from './dates';
import type { Nutrients } from './nutrition';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

/** Best guess of the meal slot from local time; the user can always change it. */
export const slotForTime = (d: Date): MealSlot => {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 19) return 'snack';
  return 'dinner';
};

export const MEAL_SOURCES = ['photo', 'voice', 'text'] as const;
export type MealSource = (typeof MEAL_SOURCES)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

const nonNegative = z.number().min(0);

export const nutrientsSchema = z.object({
  calories: nonNegative.max(5000),
  protein: nonNegative.max(500),
  carbs: nonNegative.max(1000),
  fat: nonNegative.max(500),
  fiber: nonNegative.max(200),
  sugar: nonNegative.max(500),
  saturatedFat: nonNegative.max(300),
  sodiumMg: nonNegative.max(20000),
}) satisfies z.ZodType<Nutrients>;

/** One food on the plate. `nutrients` describe ONE `portion`; `quantity` multiplies it. */
export const foodItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  portion: z.string().trim().min(1).max(60),
  grams: nonNegative.max(5000),
  quantity: z.number().min(0.25).max(20),
  nutrients: nutrientsSchema,
  confidence: z.enum(CONFIDENCE_LEVELS),
});
export type FoodItem = z.infer<typeof foodItemSchema>;

/** What the AI proposes. Never persisted directly — the user reviews it first. */
export const mealDraftSchema = z.object({
  isFood: z.boolean(),
  title: z.string(),
  items: z.array(foodItemSchema),
  /** For voice input: what Olive heard, so the user can spot mishearing. */
  transcript: z.string().optional(),
  /** Friendly explanation when nothing could be identified. */
  message: z.string().optional(),
});
export type MealDraft = z.infer<typeof mealDraftSchema>;

export const analyzeTextSchema = z.object({
  text: z.string().trim().min(2, 'Describe what you ate').max(500),
});

/** ~250 KB of base64 is plenty for a 600px JPEG thumbnail. */
const MAX_PHOTO_BASE64 = 350_000;

export const createMealSchema = z.object({
  /** Generated on the device; makes "Save" idempotent across double taps and retries. */
  clientId: z.uuid(),
  date: z.string().regex(DATE_KEY_REGEX),
  slot: z.enum(MEAL_SLOTS),
  source: z.enum(MEAL_SOURCES),
  title: z.string().trim().min(1).max(80),
  loggedAt: z.iso.datetime({ offset: true }),
  items: z.array(foodItemSchema).min(1, 'Add at least one item').max(30),
  photoBase64: z.string().max(MAX_PHOTO_BASE64).optional(),
});
export type CreateMealInput = z.infer<typeof createMealSchema>;

export const updateMealSchema = createMealSchema.pick({ date: true, slot: true, title: true, items: true }).partial();
export type UpdateMealInput = z.infer<typeof updateMealSchema>;

export interface MealItem extends FoodItem {
  id: string;
}

export interface Meal {
  id: string;
  date: string;
  slot: MealSlot;
  source: MealSource;
  title: string;
  loggedAt: string;
  photoUrl: string | null;
  items: MealItem[];
  totals: Nutrients;
}
