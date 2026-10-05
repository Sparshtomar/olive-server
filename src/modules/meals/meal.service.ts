import type { CreateMealInput, Meal, MealDraft, UpdateMealInput } from '@sparshtomar/olive-shared';
import type { MealAnalyzer, MealInput } from '../../ai';
import { notFood, notFound, unsupportedFile } from '../../lib/errors';
import { detectImageType } from '../../lib/files';
import { toMeal } from './meal.mapper';
import type { MealRepository, PhotoData, SlotTotals } from './meal.repository';

const NOT_FOOD_FALLBACK = "Olive couldn't spot any food there. Try another photo or just type what you ate.";

export class MealService {
  constructor(
    private readonly meals: MealRepository,
    private readonly analyzer: MealAnalyzer,
  ) {}

  /** Returns a draft for the user to review. Nothing is saved here. */
  async analyze(input: MealInput): Promise<MealDraft> {
    const draft = await this.analyzer.analyze(input);
    if (!draft.isFood) throw notFood(draft.message ?? NOT_FOOD_FALLBACK);
    return draft;
  }

  async create(userId: string, input: CreateMealInput): Promise<{ meal: Meal; created: boolean }> {
    const { photoBase64, ...rest } = input;
    const result = await this.meals.create(userId, rest, photoBase64 ? decodePhoto(photoBase64) : undefined);
    return { meal: toMeal(result.meal), created: result.created };
  }

  async get(userId: string, id: string): Promise<Meal> {
    const row = await this.meals.findById(userId, id);
    if (!row) throw notFound('Meal');
    return toMeal(row);
  }

  async update(userId: string, id: string, patch: UpdateMealInput): Promise<Meal> {
    const row = await this.meals.update(userId, id, patch);
    if (!row) throw notFound('Meal');
    return toMeal(row);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.meals.delete(userId, id))) throw notFound('Meal');
  }

  // Read side used by other modules (progress, insights): they go through the service, never the repository.

  async listByDate(userId: string, date: string): Promise<Meal[]> {
    return (await this.meals.listByDate(userId, date)).map(toMeal);
  }

  /** Per-day, per-slot nutrient sums, aggregated in SQL so trends never load meal rows. */
  slotTotals(userId: string, from: string, to: string): Promise<SlotTotals[]> {
    return this.meals.slotTotals(userId, from, to);
  }

  /** Dates with at least one meal, newest first. */
  loggedDates(userId: string, onOrBefore: string, limit: number): Promise<string[]> {
    return this.meals.loggedDates(userId, onOrBefore, limit);
  }

  async photo(mealId: string): Promise<PhotoData> {
    const photo = await this.meals.findPhoto(mealId);
    if (!photo) throw notFound('Photo');
    return photo;
  }
}

const decodePhoto = (base64: string): PhotoData => {
  const data = Buffer.from(base64.replace(/^data:[^,]+,/, ''), 'base64');
  const mimeType = detectImageType(data);
  if (!mimeType) throw unsupportedFile('Meal photos must be JPEG, PNG or WebP');
  return { mimeType, data };
};
