import { describe, expect, it } from 'vitest';
import {
  MARKER_CATALOG,
  deriveNutritionFocus,
  evaluateMarker,
  markerStatus,
  matchMarker,
  toCanonicalUnit,
} from '../src';

describe('matchMarker', () => {
  it.each([
    ['LDL Cholesterol', 'ldl'],
    ['LDL-C (Direct)', 'ldl'],
    ['Serum Creatinine', 'creatinine'],
    ['S. Uric Acid', 'uric_acid'],
    ['Glycosylated Haemoglobin (HbA1c)', 'hba1c'],
    ['Thyroid Stimulating Hormone (TSH)', 'tsh'],
    ['HbA1c', 'hba1c'],
    ['25-OH Vitamin D', 'vitamin_d'],
    ['Haemoglobin', 'hemoglobin'],
  ])('%s → %s', (name, key) => {
    expect(matchMarker(name)?.key).toBe(key);
  });

  it('does not confuse VLDL or non-HDL with LDL/HDL', () => {
    expect(matchMarker('VLDL Cholesterol')).toBeUndefined();
    expect(matchMarker('Non-HDL Cholesterol')).toBeUndefined();
  });
});

describe('toCanonicalUnit', () => {
  it('converts mmol/L cholesterol to mg/dL', () => {
    expect(toCanonicalUnit(MARKER_CATALOG.ldl, 3.36, 'mmol/L')).toBeCloseTo(129.9, 0);
  });
  it('converts HbA1c mmol/mol to %', () => {
    expect(toCanonicalUnit(MARKER_CATALOG.hba1c, 48, 'mmol/mol')).toBeCloseTo(6.54, 1);
  });
  it('handles µ/mc spelling variants', () => {
    expect(toCanonicalUnit(MARKER_CATALOG.creatinine, 88.4, 'µmol/L')).toBeCloseTo(1, 2);
    expect(toCanonicalUnit(MARKER_CATALOG.tsh, 2.1, 'μIU/mL')).toBe(2.1);
  });
  it('refuses to guess an unknown unit', () => {
    expect(toCanonicalUnit(MARKER_CATALOG.ldl, 130, 'furlongs')).toBeNull();
  });
});

describe('markerStatus', () => {
  it('classifies against open and closed ranges', () => {
    expect(markerStatus(130, { high: 100 })).toBe('high');
    expect(markerStatus(35, { low: 40 })).toBe('low');
    expect(markerStatus(5.6, { low: 4, high: 5.6 })).toBe('normal');
  });
});

describe('deriveNutritionFocus', () => {
  it('merges overlapping targets and keeps the strictest one with every reason', () => {
    const focus = deriveNutritionFocus([
      { key: 'ldl', status: 'high' },
      { key: 'hba1c', status: 'high' },
      { key: 'triglycerides', status: 'high' },
      { key: 'vitamin_d', status: 'low' },
      { key: 'hdl', status: 'normal' },
    ]);
    const byNutrient = Object.fromEntries(focus.map((f) => [f.nutrient, f]));
    expect(Object.keys(byNutrient).sort()).toEqual(['fiber', 'saturatedFat', 'sugar']);
    expect(byNutrient.sugar?.reasons.map((r) => r.key)).toEqual(['hba1c', 'triglycerides']);
    expect(byNutrient.fiber?.kind).toBe('min');
  });

  it('returns nothing when all markers are normal', () => {
    expect(deriveNutritionFocus([{ key: 'ldl', status: 'normal' }])).toEqual([]);
  });
});

describe('evaluateMarker', () => {
  it('judges tracked markers by the catalog range so trends stay comparable across labs', () => {
    const r = evaluateMarker(
      { name: 'LDL Cholesterol', value: 120, unit: 'mg/dL', refLow: null, refHigh: 130 },
      'male',
    );
    expect(r).toEqual({ key: 'ldl', canonicalValue: 120, status: 'high' });
  });
  it('falls back to the catalog range and converts units', () => {
    const r = evaluateMarker({ name: 'HbA1c', value: 48, unit: 'mmol/mol', refLow: null, refHigh: null }, 'female');
    expect(r.key).toBe('hba1c');
    expect(r.canonicalValue).toBe(6.5);
    expect(r.status).toBe('high');
  });
  it('uses sex-specific catalog ranges', () => {
    const m = { name: 'Haemoglobin', value: 12.8, unit: 'g/dL', refLow: null, refHigh: null };
    expect(evaluateMarker(m, 'female').status).toBe('normal');
    expect(evaluateMarker(m, 'male').status).toBe('low');
  });
  it('keeps untracked markers but flags them from the printed range', () => {
    const r = evaluateMarker({ name: 'SGPT', value: 60, unit: 'U/L', refLow: 0, refHigh: 45 }, 'male');
    expect(r).toEqual({ key: null, canonicalValue: null, status: 'high' });
  });
  it('does not track a known marker with an unknown unit, but still uses its printed range', () => {
    expect(evaluateMarker({ name: 'LDL', value: 3, unit: 'weird', refLow: null, refHigh: null }, 'male')).toEqual({
      key: null,
      canonicalValue: null,
      status: null,
    });
    expect(evaluateMarker({ name: 'LDL', value: 3, unit: 'weird', refLow: null, refHigh: 2.6 }, 'male').status).toBe(
      'high',
    );
  });
});
