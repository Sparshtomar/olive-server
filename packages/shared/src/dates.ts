/**
 * Days are identified by the user's *local* calendar date ("YYYY-MM-DD"), chosen on
 * the device. A meal eaten at 11:30 pm in Delhi belongs to that day, whatever UTC says.
 */
export type DateKey = string;

export const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const toDateKey = (d: Date): DateKey => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const fromDateKey = (key: DateKey): Date => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export const addDays = (key: DateKey, days: number): DateKey => {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

/** Inclusive list of date keys ending at `end`. */
export const lastNDays = (end: DateKey, n: number): DateKey[] =>
  Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
