import type { FoodItem, MealDraft, Nutrients, ReportDraft } from '@sparshtomar/olive-shared';
import type { MealAnalyzer, MealInput, ReportExtractor } from '../types';

/**
 * Deterministic stand-ins for local development without an API key (AI_PROVIDER=mock).
 * They return plausible, valid drafts so every screen and state can be exercised.
 */

type Food = { portion: string; grams: number; nutrients: Nutrients };

const FOODS: Record<string, Food> = {
  roti: {
    portion: '1 roti',
    grams: 35,
    nutrients: {
      calories: 104,
      protein: 3.1,
      carbs: 18,
      fat: 2.4,
      fiber: 2.7,
      sugar: 0.4,
      saturatedFat: 0.4,
      sodiumMg: 120,
    },
  },
  rice: {
    portion: '1 cup cooked',
    grams: 160,
    nutrients: {
      calories: 205,
      protein: 4.3,
      carbs: 45,
      fat: 0.4,
      fiber: 0.6,
      sugar: 0.1,
      saturatedFat: 0.1,
      sodiumMg: 2,
    },
  },
  dal: {
    portion: '1 katori (150 g)',
    grams: 150,
    nutrients: {
      calories: 165,
      protein: 9,
      carbs: 22,
      fat: 4.5,
      fiber: 5,
      sugar: 1.5,
      saturatedFat: 1.8,
      sodiumMg: 420,
    },
  },
  egg: {
    portion: '1 egg',
    grams: 50,
    nutrients: {
      calories: 72,
      protein: 6.3,
      carbs: 0.4,
      fat: 4.8,
      fiber: 0,
      sugar: 0.2,
      saturatedFat: 1.6,
      sodiumMg: 71,
    },
  },
  chicken: {
    portion: '1 serving (120 g)',
    grams: 120,
    nutrients: {
      calories: 240,
      protein: 30,
      carbs: 2,
      fat: 12,
      fiber: 0.5,
      sugar: 1,
      saturatedFat: 3.4,
      sodiumMg: 480,
    },
  },
  paneer: {
    portion: '1 katori (150 g)',
    grams: 150,
    nutrients: { calories: 330, protein: 14, carbs: 10, fat: 26, fiber: 2, sugar: 5, saturatedFat: 14, sodiumMg: 560 },
  },
  banana: {
    portion: '1 medium',
    grams: 118,
    nutrients: {
      calories: 105,
      protein: 1.3,
      carbs: 27,
      fat: 0.4,
      fiber: 3.1,
      sugar: 14,
      saturatedFat: 0.1,
      sodiumMg: 1,
    },
  },
  coffee: {
    portion: '1 cup with milk',
    grams: 200,
    nutrients: { calories: 70, protein: 3, carbs: 8, fat: 3, fiber: 0, sugar: 7, saturatedFat: 1.9, sodiumMg: 45 },
  },
  oats: {
    portion: '1 bowl',
    grams: 240,
    nutrients: { calories: 250, protein: 9, carbs: 40, fat: 6, fiber: 6, sugar: 9, saturatedFat: 1.8, sodiumMg: 110 },
  },
  salad: {
    portion: '1 bowl',
    grams: 120,
    nutrients: {
      calories: 35,
      protein: 1.5,
      carbs: 7,
      fat: 0.3,
      fiber: 2.5,
      sugar: 3.5,
      saturatedFat: 0,
      sodiumMg: 15,
    },
  },
};

const GENERIC: Food = {
  portion: '1 serving',
  grams: 200,
  nutrients: { calories: 250, protein: 8, carbs: 30, fat: 10, fiber: 3, sugar: 5, saturatedFat: 3, sodiumMg: 350 },
};

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, half: 0.5 };

const item = (name: string, food: Food, quantity = 1, confidence: FoodItem['confidence'] = 'high'): FoodItem => ({
  name,
  portion: food.portion,
  grams: food.grams,
  quantity,
  nutrients: { ...food.nutrients },
  confidence,
});

const parseText = (text: string): FoodItem[] =>
  text
    .split(/,|\band\b|\bwith\b|\+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const words = part.toLowerCase().split(/\s+/);
      const first = words[0] ?? '';
      const qty = Number(first) || NUMBER_WORDS[first] || 1;
      const known = Object.keys(FOODS).find((k) => words.some((w) => w.startsWith(k)));
      const name = part.replace(/^(\d+|a|an|one|two|three|four|half)\s+/i, '');
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      return known ? item(label, FOODS[known]!, Math.min(qty, 20)) : item(label, GENERIC, 1, 'low');
    });

export class MockMealAnalyzer implements MealAnalyzer {
  async analyze(input: MealInput): Promise<MealDraft> {
    await delay(700);
    if (input.kind === 'text') {
      const items = parseText(input.text);
      return { isFood: items.length > 0, title: input.text.slice(0, 80), items };
    }
    if (input.kind === 'voice') {
      const transcript = 'Two eggs, a slice of toast and a coffee';
      return {
        isFood: true,
        title: 'Eggs, toast and coffee',
        transcript,
        items: [item('Boiled egg', FOODS.egg!, 2), item('Toast', GENERIC, 1, 'medium'), item('Coffee', FOODS.coffee!)],
      };
    }
    return {
      isFood: true,
      title: 'Paneer butter masala with roti',
      items: [
        item('Paneer butter masala', FOODS.paneer!, 1, 'medium'),
        item('Roti', FOODS.roti!, 2),
        item('Salad', FOODS.salad!),
      ],
    };
  }
}

export class MockReportExtractor implements ReportExtractor {
  async extract(): Promise<ReportDraft> {
    await delay(1200);
    return {
      isLabReport: true,
      labName: 'Sample Diagnostics — Lipid profile',
      reportDate: null,
      markers: [
        { name: 'Total Cholesterol', value: 218, unit: 'mg/dL', refLow: null, refHigh: 200 },
        { name: 'LDL Cholesterol', value: 142, unit: 'mg/dL', refLow: null, refHigh: 100 },
        { name: 'HDL Cholesterol', value: 44, unit: 'mg/dL', refLow: 40, refHigh: null },
        { name: 'Triglycerides', value: 160, unit: 'mg/dL', refLow: null, refHigh: 150 },
        { name: 'VLDL Cholesterol', value: 32, unit: 'mg/dL', refLow: 5, refHigh: 40 },
      ],
    };
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
