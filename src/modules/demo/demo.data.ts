import type { FoodItem, MealSlot, Nutrients, ProfileInput } from '@sparshtomar/olive-shared';

/** A believable person: mildly overweight, borderline cholesterol and sugar, low vitamin D. */
export const DEMO_PROFILE: ProfileInput = {
  name: 'Riya',
  sex: 'female',
  age: 31,
  heightCm: 162,
  weightKg: 68,
  activityLevel: 'light',
  goalType: 'lose',
  paceKgPerWeek: 0.25,
};

const food = (
  name: string,
  portion: string,
  grams: number,
  [calories, protein, carbs, fat, fiber, sugar, saturatedFat, sodiumMg]: number[],
  confidence: FoodItem['confidence'] = 'high',
): FoodItem => ({
  name,
  portion,
  grams,
  quantity: 1,
  confidence,
  nutrients: { calories, protein, carbs, fat, fiber, sugar, saturatedFat, sodiumMg } as Nutrients,
});

const F = {
  poha: food('Poha', '1 plate', 200, [270, 5, 45, 8, 3, 3, 1.2, 380]),
  chai: food('Masala chai', '1 cup', 150, [90, 3, 12, 3.5, 0, 10, 2.1, 40]),
  oats: food('Oats with milk & banana', '1 bowl', 280, [310, 11, 52, 7, 6, 18, 2.6, 110]),
  eggs: food('Boiled eggs', '2 eggs', 100, [144, 12.6, 0.8, 9.6, 0, 0.4, 3.2, 142]),
  toast: food('Brown bread toast', '2 slices', 60, [150, 6, 26, 2, 4, 3, 0.4, 260]),
  paratha: food('Aloo paratha', '2 parathas', 240, [580, 12, 72, 26, 6, 3, 9.5, 720], 'medium'),
  curd: food('Curd', '1 katori', 150, [90, 5, 7, 4.5, 0, 6, 2.9, 55]),
  idli: food('Idli with sambar', '3 idlis + 1 katori', 330, [310, 11, 58, 4, 7, 4, 0.8, 690]),
  dal: food('Dal tadka', '1 katori', 150, [165, 9, 22, 4.5, 5, 1.5, 1.8, 420]),
  rice: food('Steamed rice', '1 cup', 160, [205, 4.3, 45, 0.4, 0.6, 0.1, 0.1, 2]),
  roti: food('Phulka', '2 rotis', 70, [208, 6.2, 36, 4.8, 5.4, 0.8, 0.8, 240]),
  sabzi: food('Mixed veg sabzi', '1 katori', 150, [140, 3.5, 14, 8, 4.5, 5, 1.3, 380], 'medium'),
  rajma: food('Rajma', '1 katori', 180, [240, 13, 34, 6, 10, 2, 0.9, 480]),
  paneer: food('Paneer butter masala', '1 katori', 150, [330, 14, 10, 26, 2, 5, 14, 560], 'medium'),
  chicken: food('Chicken curry', '1 katori', 180, [290, 28, 8, 16, 1.5, 3, 4.2, 620], 'medium'),
  salad: food('Cucumber-tomato salad', '1 bowl', 120, [35, 1.5, 7, 0.3, 2.5, 3.5, 0, 15]),
  biryani: food('Chicken biryani', '1 plate', 350, [650, 30, 78, 22, 3, 3, 7.5, 980], 'medium'),
  samosa: food('Samosa', '1 piece', 80, [260, 4, 28, 15, 2.5, 1, 5.8, 420]),
  biscuits: food('Marie biscuits', '4 biscuits', 28, [125, 2, 21, 3.5, 0.6, 6, 1.6, 90]),
  fruit: food('Apple', '1 medium', 180, [95, 0.5, 25, 0.3, 4.4, 19, 0, 2]),
  sprouts: food('Sprouts chaat', '1 bowl', 150, [160, 11, 26, 1.5, 7.5, 4, 0.2, 290]),
  pizza: food('Margherita pizza', '3 slices', 300, [800, 33, 96, 30, 5, 10, 14, 1600], 'medium'),
  coke: food('Cola', '1 can', 330, [139, 0, 35, 0, 0, 35, 0, 45]),
  dosa: food('Masala dosa', '1 dosa', 250, [390, 8, 52, 16, 4, 3, 6, 620], 'medium'),
  lassi: food('Sweet lassi', '1 glass', 250, [220, 7, 32, 7, 0, 30, 4.5, 110]),
};

/** Options per slot; the generator picks one deterministically per day. */
export const MEAL_OPTIONS: Record<MealSlot, { title: string; items: FoodItem[] }[]> = {
  breakfast: [
    { title: 'Poha and chai', items: [F.poha, F.chai] },
    { title: 'Oats bowl', items: [F.oats] },
    { title: 'Eggs on toast', items: [F.eggs, F.toast, F.chai] },
    { title: 'Aloo paratha with curd', items: [F.paratha, F.curd] },
    { title: 'Idli sambar', items: [F.idli] },
  ],
  lunch: [
    { title: 'Dal chawal with salad', items: [F.dal, F.rice, F.salad] },
    { title: 'Rajma chawal', items: [F.rajma, F.rice] },
    { title: 'Roti sabzi and dal', items: [F.roti, F.sabzi, F.dal] },
    { title: 'Chicken curry with roti', items: [F.chicken, F.roti, F.salad] },
  ],
  snack: [
    { title: 'Chai and biscuits', items: [F.chai, F.biscuits] },
    { title: 'Apple', items: [F.fruit] },
    { title: 'Samosa and chai', items: [F.samosa, F.chai] },
    { title: 'Sprouts chaat', items: [F.sprouts] },
  ],
  dinner: [
    { title: 'Paneer butter masala with roti', items: [F.paneer, F.roti] },
    { title: 'Dal, sabzi and roti', items: [F.dal, F.sabzi, F.roti] },
    { title: 'Chicken biryani', items: [F.biryani, F.salad] },
    { title: 'Masala dosa', items: [F.dosa] },
  ],
};

/** A weekend treat that makes the "weekends run heavier" insight show up honestly. */
export const WEEKEND_TREATS = [
  { slot: 'dinner' as const, title: 'Pizza night', items: [F.pizza, F.coke] },
  { slot: 'snack' as const, title: 'Sweet lassi', items: [F.lassi] },
];

/** Two reports four months apart: things are improving, but not there yet. */
export const DEMO_REPORTS = [
  {
    monthsAgo: 4,
    title: 'Annual health check - Metropolis',
    markers: [
      { name: 'Total Cholesterol', value: 231, unit: 'mg/dL', refLow: null, refHigh: 200 },
      { name: 'LDL Cholesterol', value: 152, unit: 'mg/dL', refLow: null, refHigh: 100 },
      { name: 'HDL Cholesterol', value: 43, unit: 'mg/dL', refLow: 50, refHigh: null },
      { name: 'Triglycerides', value: 176, unit: 'mg/dL', refLow: null, refHigh: 150 },
      { name: 'HbA1c', value: 5.9, unit: '%', refLow: 4, refHigh: 5.6 },
      { name: 'Fasting Blood Sugar', value: 104, unit: 'mg/dL', refLow: 70, refHigh: 99 },
      { name: '25-OH Vitamin D', value: 16, unit: 'ng/mL', refLow: 30, refHigh: 100 },
      { name: 'Haemoglobin', value: 11.6, unit: 'g/dL', refLow: 12, refHigh: 15.5 },
      { name: 'TSH', value: 2.4, unit: 'µIU/mL', refLow: 0.4, refHigh: 4.2 },
    ],
  },
  {
    monthsAgo: 0.5,
    title: 'Lipid & sugar follow-up - Thyrocare',
    markers: [
      { name: 'Total Cholesterol', value: 214, unit: 'mg/dL', refLow: null, refHigh: 200 },
      { name: 'LDL Cholesterol', value: 136, unit: 'mg/dL', refLow: null, refHigh: 100 },
      { name: 'HDL Cholesterol', value: 46, unit: 'mg/dL', refLow: 50, refHigh: null },
      { name: 'VLDL Cholesterol', value: 32, unit: 'mg/dL', refLow: 5, refHigh: 40 },
      { name: 'Triglycerides', value: 158, unit: 'mg/dL', refLow: null, refHigh: 150 },
      { name: 'HbA1c', value: 5.8, unit: '%', refLow: 4, refHigh: 5.6 },
      { name: '25-OH Vitamin D', value: 24, unit: 'ng/mL', refLow: 30, refHigh: 100 },
      { name: 'Haemoglobin', value: 12.3, unit: 'g/dL', refLow: 12, refHigh: 15.5 },
    ],
  },
];
