import { scaleNutrients, sumNutrients, type Meal, type MealItem, type Nutrients } from '@sparshtomar/olive-shared';
import type { MealRow } from './meal.repository';

type ItemRow = MealRow['items'][number];

const nutrientsOf = (i: ItemRow): Nutrients => ({
  calories: i.calories,
  protein: i.protein,
  carbs: i.carbs,
  fat: i.fat,
  fiber: i.fiber,
  sugar: i.sugar,
  saturatedFat: i.saturatedFat,
  sodiumMg: i.sodiumMg,
});

const toItem = (i: ItemRow): MealItem => ({
  id: i.id,
  name: i.name,
  portion: i.portion,
  grams: i.grams,
  quantity: i.quantity,
  confidence: i.confidence,
  nutrients: nutrientsOf(i),
});

export const toMeal = (row: MealRow): Meal => {
  const items = row.items.map(toItem);
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    source: row.source,
    title: row.title,
    loggedAt: row.loggedAt.toISOString(),
    photoUrl: row.hasPhoto ? `/meals/${row.id}/photo` : null,
    items,
    totals: sumNutrients(items.map((i) => scaleNutrients(i.nutrients, i.quantity))),
  };
};
