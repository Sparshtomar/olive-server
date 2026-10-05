// Matching lab-report names and units to the catalog, and turning values into statuses and diet focus.
import type { Sex } from '../profile';
import {
  MARKER_CATALOG,
  type MarkerDefinition,
  type MarkerKey,
  type MarkerStatus,
  type Range,
  type FocusTarget,
  type FocusNutrient,
} from './catalog';

export const normalizeMarkerName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/haem/g, 'hem')
    .replace(/[^a-z0-9]/g, '');

export const normalizeUnit = (unit: string): string =>
  unit.toLowerCase().replace(/\s+/g, '').replace(/[µμ]/g, 'u').replace(/mcg/g, 'ug');

const ALIAS_INDEX = new Map<string, MarkerDefinition>(
  Object.values(MARKER_CATALOG).flatMap((d) => d.aliases.map((a) => [normalizeMarkerName(a), d] as const)),
);

/** Prefixes labs put in front of a marker name ("Serum LDL", "S. Creatinine"). */
const NAME_PREFIXES = ['serum', 'plasma', 'blood', 'direct', 's'];

const matchNormalized = (normalized: string): MarkerDefinition | undefined => {
  const exact = ALIAS_INDEX.get(normalized);
  if (exact) return exact;
  for (const prefix of NAME_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue;
    const match = ALIAS_INDEX.get(normalized.slice(prefix.length));
    if (match) return match;
  }
  return undefined;
};

/**
 * Finds the catalog entry for a marker name as printed on a report. Exact alias
 * matches only, so "VLDL" or "Non-HDL cholesterol" never get tracked as LDL/HDL.
 * "Glycosylated Haemoglobin (HbA1c)" tries the full name, the name without the
 * brackets and the bracketed part on its own.
 */
export const matchMarker = (name: string): MarkerDefinition | undefined => {
  const bracketed = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1] ?? '');
  const candidates = [name, name.replace(/\([^)]*\)/g, ''), ...bracketed];
  for (const candidate of candidates) {
    const match = matchNormalized(normalizeMarkerName(candidate));
    if (match) return match;
  }
  return undefined;
};

/**
 * Converts a value into the marker's canonical unit.
 * Returns `null` when the unit is unknown, so the caller can keep the raw value
 * instead of tracking a number that might be off by 38×.
 */
export const toCanonicalUnit = (def: MarkerDefinition, value: number, unit: string): number | null => {
  const u = normalizeUnit(unit);
  if (u === normalizeUnit(def.unit) || u === '') return value;
  const convert = def.conversions[u];
  return convert ? convert(value) : null;
};

export const markerStatus = (value: number, range: Range): MarkerStatus => {
  if (range.low !== undefined && value < range.low) return 'low';
  if (range.high !== undefined && value > range.high) return 'high';
  return 'normal';
};

export const formatRange = (range: Range, unit: string): string => {
  if (range.low !== undefined && range.high !== undefined) return `${range.low}–${range.high} ${unit}`;
  if (range.high !== undefined) return `< ${range.high} ${unit}`;
  if (range.low !== undefined) return `> ${range.low} ${unit}`;
  return '';
};

export interface NutritionFocus extends FocusTarget {
  /** Markers that caused this focus, for "because your LDL is high". */
  reasons: { key: MarkerKey; name: string; status: MarkerStatus }[];
}

/**
 * Turns out-of-range markers into daily nutrient targets. When several markers ask
 * for the same nutrient, the strictest target wins and all reasons are kept.
 */
export const deriveNutritionFocus = (latest: { key: MarkerKey; status: MarkerStatus }[]): NutritionFocus[] => {
  const byNutrient = new Map<FocusNutrient, NutritionFocus>();
  for (const marker of latest) {
    if (marker.status === 'normal') continue;
    const def = MARKER_CATALOG[marker.key];
    for (const target of def.focus?.[marker.status] ?? []) {
      const reason = { key: def.key, name: def.name, status: marker.status };
      const existing = byNutrient.get(target.nutrient);
      if (!existing) {
        byNutrient.set(target.nutrient, { ...target, reasons: [reason] });
        continue;
      }
      existing.amount =
        target.kind === 'max' ? Math.min(existing.amount, target.amount) : Math.max(existing.amount, target.amount);
      existing.reasons.push(reason);
    }
  }
  return [...byNutrient.values()];
};

export interface MarkerEvaluation {
  key: MarkerKey | null;
  /** Value in the catalog's canonical unit; null when untracked or the unit is unknown. */
  canonicalValue: number | null;
  status: MarkerStatus | null;
}

/**
 * Classifies one printed result.
 *
 * Tracked markers are judged against Olive's catalog range in canonical units, so a
 * trend mixing two labs (or mg/dL and mmol/L) stays comparable and matches the range
 * drawn on the chart. Untracked markers fall back to the lab's printed range.
 */
export const evaluateMarker = (
  m: { name: string; value: number; unit: string; refLow: number | null; refHigh: number | null },
  sex: Sex,
): MarkerEvaluation => {
  const def = matchMarker(m.name);
  const canonicalValue = def ? toCanonicalUnit(def, m.value, m.unit) : null;

  if (def && canonicalValue !== null) {
    const value = round(canonicalValue, def.decimals);
    return { key: def.key, canonicalValue: value, status: markerStatus(value, def.range(sex)) };
  }

  const printed: Range = { low: m.refLow ?? undefined, high: m.refHigh ?? undefined };
  const hasPrinted = printed.low !== undefined || printed.high !== undefined;
  return { key: null, canonicalValue: null, status: hasPrinted ? markerStatus(m.value, printed) : null };
};

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};
