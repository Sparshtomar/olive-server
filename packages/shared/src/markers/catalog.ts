// The lab markers Olive understands: keys, aliases, units, reference ranges and diet links.
import type { NutrientKey } from '../nutrition';
import type { Sex } from '../profile';

export const MARKER_KEYS = [
  'ldl',
  'hdl',
  'total_cholesterol',
  'triglycerides',
  'hba1c',
  'fasting_glucose',
  'vitamin_d',
  'vitamin_b12',
  'hemoglobin',
  'tsh',
  'creatinine',
  'uric_acid',
] as const;
export type MarkerKey = (typeof MARKER_KEYS)[number];

export type MarkerStatus = 'low' | 'normal' | 'high';

export interface Range {
  low?: number;
  high?: number;
}

export type FocusNutrient = Extract<NutrientKey, 'saturatedFat' | 'sugar' | 'fiber' | 'sodiumMg' | 'protein'>;

export interface FocusTarget {
  nutrient: FocusNutrient;
  /** "max" = stay under, "min" = reach at least. */
  kind: 'max' | 'min';
  amount: number;
}

export interface MarkerDefinition {
  key: MarkerKey;
  name: string;
  /** Canonical unit everything is converted to. */
  unit: string;
  decimals: number;
  /** Normalised names labs commonly print. */
  aliases: string[];
  /** Converters from other units (normalised, see `normalizeUnit`) to the canonical unit. */
  conversions: Record<string, (v: number) => number>;
  range: (sex: Sex) => Range;
  /** Diet levers Olive tracks daily when this marker is out of range. */
  focus?: Partial<Record<Exclude<MarkerStatus, 'normal'>, FocusTarget[]>>;
  tips: Partial<Record<Exclude<MarkerStatus, 'normal'>, string>>;
}

const SAT_FAT_LIMIT: FocusTarget = { nutrient: 'saturatedFat', kind: 'max', amount: 13 };
const SUGAR_LIMIT: FocusTarget = { nutrient: 'sugar', kind: 'max', amount: 25 };
const FIBER_MIN: FocusTarget = { nutrient: 'fiber', kind: 'min', amount: 30 };

const mul = (factor: number) => (v: number) => v * factor;
const CHOLESTEROL_MMOL = mul(38.67);

export const MARKER_CATALOG: Record<MarkerKey, MarkerDefinition> = {
  ldl: {
    key: 'ldl',
    name: 'LDL cholesterol',
    unit: 'mg/dL',
    decimals: 0,
    aliases: [
      'ldl',
      'ldlc',
      'ldlcholesterol',
      'ldlcholesteroldirect',
      'lowdensitylipoprotein',
      'lowdensitylipoproteincholesterol',
    ],
    conversions: { 'mmol/l': CHOLESTEROL_MMOL },
    range: () => ({ high: 100 }),
    focus: { high: [SAT_FAT_LIMIT, FIBER_MIN] },
    tips: {
      high: 'Swap ghee, butter and fried snacks for nuts, seeds and plant oils. Oats, dal and vegetables add soluble fiber that pulls LDL down.',
    },
  },
  hdl: {
    key: 'hdl',
    name: 'HDL cholesterol',
    unit: 'mg/dL',
    decimals: 0,
    aliases: ['hdl', 'hdlc', 'hdlcholesterol', 'highdensitylipoprotein', 'highdensitylipoproteincholesterol'],
    conversions: { 'mmol/l': CHOLESTEROL_MMOL },
    range: (sex) => ({ low: sex === 'male' ? 40 : 50 }),
    tips: { low: 'Regular cardio raises HDL the most. Nuts, fish and olive oil help too.' },
  },
  total_cholesterol: {
    key: 'total_cholesterol',
    name: 'Total cholesterol',
    unit: 'mg/dL',
    decimals: 0,
    aliases: ['totalcholesterol', 'cholesteroltotal', 'cholesterol', 'serumcholesterol', 'tc'],
    conversions: { 'mmol/l': CHOLESTEROL_MMOL },
    range: () => ({ high: 200 }),
    focus: { high: [SAT_FAT_LIMIT] },
    tips: { high: 'Cutting saturated fat (fried food, full-fat dairy, red meat) is the biggest dietary lever.' },
  },
  triglycerides: {
    key: 'triglycerides',
    name: 'Triglycerides',
    unit: 'mg/dL',
    decimals: 0,
    aliases: ['triglycerides', 'triglyceride', 'tg', 'serumtriglycerides'],
    conversions: { 'mmol/l': mul(88.57) },
    range: () => ({ high: 150 }),
    focus: { high: [SUGAR_LIMIT] },
    tips: {
      high: 'Sugar, refined carbs and alcohol raise triglycerides fastest. Sweet drinks are the first thing to cut.',
    },
  },
  hba1c: {
    key: 'hba1c',
    name: 'HbA1c',
    unit: '%',
    decimals: 1,
    aliases: [
      'hba1c',
      'a1c',
      'glycatedhemoglobin',
      'glycosylatedhemoglobin',
      'glycatedhaemoglobin',
      'glycosylatedhaemoglobin',
    ],
    conversions: { 'mmol/mol': (v) => v / 10.929 + 2.15 },
    range: () => ({ low: 4, high: 5.6 }),
    focus: { high: [SUGAR_LIMIT, FIBER_MIN] },
    tips: {
      high: 'Pair carbs with protein and fiber, and swap sweets and juices for whole fruit. Your 3-month average responds to daily habits.',
    },
  },
  fasting_glucose: {
    key: 'fasting_glucose',
    name: 'Fasting glucose',
    unit: 'mg/dL',
    decimals: 0,
    aliases: [
      'fastingglucose',
      'fastingbloodsugar',
      'fbs',
      'glucosefasting',
      'fastingplasmaglucose',
      'fpg',
      'bloodsugarfasting',
    ],
    conversions: { 'mmol/l': mul(18.016) },
    range: () => ({ low: 70, high: 99 }),
    focus: { high: [SUGAR_LIMIT, FIBER_MIN] },
    tips: { high: 'Fewer refined carbs at dinner and a short walk after meals help fasting sugar.' },
  },
  vitamin_d: {
    key: 'vitamin_d',
    name: 'Vitamin D',
    unit: 'ng/mL',
    decimals: 0,
    aliases: [
      'vitamind',
      'vitamind3',
      'vitd',
      '25ohvitamind',
      '25hydroxyvitamind',
      '25ohd',
      'vitamind25hydroxy',
      'vitamindtotal',
    ],
    conversions: { 'nmol/l': mul(1 / 2.496) },
    range: () => ({ low: 30, high: 100 }),
    tips: {
      low: 'Food alone rarely fixes this. 15–20 minutes of midday sun helps; ask your doctor about a supplement.',
    },
  },
  vitamin_b12: {
    key: 'vitamin_b12',
    name: 'Vitamin B12',
    unit: 'pg/mL',
    decimals: 0,
    aliases: ['vitaminb12', 'b12', 'cobalamin', 'cyanocobalamin', 'vitb12'],
    conversions: { 'pmol/l': mul(1.355) },
    range: () => ({ low: 200, high: 900 }),
    tips: {
      low: 'Dairy, eggs, fish and fortified cereals carry B12. Vegetarians often need a supplement - check with your doctor.',
    },
  },
  hemoglobin: {
    key: 'hemoglobin',
    name: 'Haemoglobin',
    unit: 'g/dL',
    decimals: 1,
    aliases: ['hemoglobin', 'haemoglobin', 'hb', 'hgb'],
    conversions: { 'g/l': mul(0.1), 'mmol/l': mul(1.611) },
    range: (sex) => (sex === 'male' ? { low: 13.5, high: 17.5 } : { low: 12, high: 15.5 }),
    tips: {
      low: 'Pair iron-rich foods (spinach, rajma, chana, eggs, meat) with vitamin C, and keep tea away from meals.',
    },
  },
  tsh: {
    key: 'tsh',
    name: 'TSH',
    unit: 'mIU/L',
    decimals: 2,
    aliases: ['tsh', 'thyroidstimulatinghormone', 'tshultrasensitive', 'ultrasensitivetsh'],
    conversions: { 'uiu/ml': mul(1), 'miu/ml': mul(1000) },
    range: () => ({ low: 0.4, high: 4 }),
    tips: {
      high: 'Thyroid levels are managed with your doctor, not diet. Keep logging - energy changes show up in your trends.',
      low: 'Thyroid levels are managed with your doctor, not diet.',
    },
  },
  creatinine: {
    key: 'creatinine',
    name: 'Creatinine',
    unit: 'mg/dL',
    decimals: 2,
    aliases: ['creatinine', 'serumcreatinine', 'creatinineserum'],
    conversions: { 'umol/l': mul(1 / 88.4) },
    range: (sex) => (sex === 'male' ? { low: 0.7, high: 1.3 } : { low: 0.6, high: 1.1 }),
    tips: { high: 'Worth discussing with your doctor before raising protein intake.' },
  },
  uric_acid: {
    key: 'uric_acid',
    name: 'Uric acid',
    unit: 'mg/dL',
    decimals: 1,
    aliases: ['uricacid', 'serumuricacid', 'uricacidserum', 'urate'],
    conversions: { 'umol/l': mul(1 / 59.48) },
    range: (sex) => (sex === 'male' ? { low: 3.4, high: 7 } : { low: 2.4, high: 6 }),
    focus: { high: [SUGAR_LIMIT] },
    tips: { high: 'Sugary drinks, alcohol and organ meats raise uric acid. Drink plenty of water.' },
  },
};
