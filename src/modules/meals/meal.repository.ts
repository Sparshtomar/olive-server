import { and, asc, between, desc, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { CreateMealInput, FoodItem, MealSlot, Nutrients, UpdateMealInput } from '@sparshtomar/olive-shared';
import type { Database } from '../../db/client';
import { mealItems, mealPhotos, meals } from '../../db/schema';

export type MealRow = typeof meals.$inferSelect & { items: (typeof mealItems.$inferSelect)[] };

export interface PhotoData {
  mimeType: string;
  data: Buffer;
}

export interface SlotTotals extends Nutrients {
  date: string;
  slot: MealSlot;
  meals: number;
}

const itemColumns = (mealId: string, items: FoodItem[]) =>
  items.map((item, position) => ({
    mealId,
    position,
    name: item.name,
    portion: item.portion,
    grams: item.grams,
    quantity: item.quantity,
    confidence: item.confidence,
    ...item.nutrients,
  }));

/** sum(nutrient × quantity) — items store nutrients for one portion. */
const total = (column: AnyPgColumn) => sql<number>`coalesce(sum(${column} * ${mealItems.quantity}), 0)`.mapWith(Number);

export class MealRepository {
  constructor(private readonly db: Database) {}

  /**
   * Creates a meal with its items (and optional photo) atomically. If a meal with the
   * same device `clientId` already exists, returns it instead — retries and double taps
   * never create duplicates.
   */
  async create(
    userId: string,
    input: CreateMealInput,
    photo?: PhotoData,
  ): Promise<{ meal: MealRow; created: boolean }> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(meals)
        .values({
          userId,
          clientId: input.clientId,
          date: input.date,
          slot: input.slot,
          source: input.source,
          title: input.title,
          loggedAt: new Date(input.loggedAt),
          hasPhoto: !!photo,
        })
        .onConflictDoNothing({ target: [meals.userId, meals.clientId] })
        .returning({ id: meals.id });

      if (!inserted) {
        const existing = await tx.query.meals.findFirst({
          where: and(eq(meals.userId, userId), eq(meals.clientId, input.clientId)),
          with: { items: { orderBy: asc(mealItems.position) } },
        });
        return { meal: existing!, created: false };
      }

      await tx.insert(mealItems).values(itemColumns(inserted.id, input.items));
      if (photo) await tx.insert(mealPhotos).values({ mealId: inserted.id, ...photo });

      const meal = await tx.query.meals.findFirst({
        where: eq(meals.id, inserted.id),
        with: { items: { orderBy: asc(mealItems.position) } },
      });
      return { meal: meal!, created: true };
    });
  }

  async findById(userId: string, id: string): Promise<MealRow | undefined> {
    return this.db.query.meals.findFirst({
      where: and(eq(meals.id, id), eq(meals.userId, userId)),
      with: { items: { orderBy: asc(mealItems.position) } },
    });
  }

  async listByDate(userId: string, date: string): Promise<MealRow[]> {
    return this.db.query.meals.findMany({
      where: and(eq(meals.userId, userId), eq(meals.date, date)),
      with: { items: { orderBy: asc(mealItems.position) } },
      orderBy: [asc(meals.loggedAt)],
    });
  }

  /** Replaces the fields given; `items`, when present, replaces the whole item list. */
  async update(userId: string, id: string, patch: UpdateMealInput): Promise<MealRow | undefined> {
    return this.db.transaction(async (tx) => {
      const { items, ...fields } = patch;
      const [updated] = await tx
        .update(meals)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(meals.id, id), eq(meals.userId, userId)))
        .returning({ id: meals.id });
      if (!updated) return undefined;

      if (items) {
        await tx.delete(mealItems).where(eq(mealItems.mealId, id));
        await tx.insert(mealItems).values(itemColumns(id, items));
      }
      return tx.query.meals.findFirst({
        where: eq(meals.id, id),
        with: { items: { orderBy: asc(mealItems.position) } },
      });
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, userId)))
      .returning({ id: meals.id });
    return deleted.length > 0;
  }

  async findPhoto(mealId: string): Promise<PhotoData | undefined> {
    return this.db.query.mealPhotos.findFirst({
      where: eq(mealPhotos.mealId, mealId),
      columns: { mimeType: true, data: true },
    });
  }

  /** Nutrient totals per day and meal slot — the raw material for trends and insights. */
  async slotTotals(userId: string, from: string, to: string): Promise<SlotTotals[]> {
    return this.db
      .select({
        date: meals.date,
        slot: meals.slot,
        meals: sql<number>`count(distinct ${meals.id})`.mapWith(Number),
        calories: total(mealItems.calories),
        protein: total(mealItems.protein),
        carbs: total(mealItems.carbs),
        fat: total(mealItems.fat),
        fiber: total(mealItems.fiber),
        sugar: total(mealItems.sugar),
        saturatedFat: total(mealItems.saturatedFat),
        sodiumMg: total(mealItems.sodiumMg),
      })
      .from(meals)
      .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
      .where(and(eq(meals.userId, userId), between(meals.date, from, to)))
      .groupBy(meals.date, meals.slot)
      .orderBy(asc(meals.date));
  }

  /** Distinct days with at least one meal, newest first. */
  async loggedDates(userId: string, onOrBefore: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ date: meals.date })
      .from(meals)
      .where(and(eq(meals.userId, userId), sql`${meals.date} <= ${onOrBefore}`))
      .orderBy(desc(meals.date))
      .limit(limit);
    return rows.map((r) => r.date);
  }
}
