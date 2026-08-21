/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Case-insensitive "any field contains the query" match. An empty query matches
 * everything so callers can pass raw input state straight through.
 */
export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some(field => !!field && field.toLowerCase().includes(needle));
}

/**
 * Inclusive date-range check against `YYYY-MM-DD` inputs, expanding the bounds
 * to the full local day. Empty bounds are treated as unbounded.
 */
export function isWithinDateRange(
  timestamp: string | number | Date,
  startDate: string,
  endDate: string
): boolean {
  const time = new Date(timestamp).getTime();
  if (startDate && time < new Date(`${startDate}T00:00:00`).getTime()) return false;
  if (endDate && time > new Date(`${endDate}T23:59:59`).getTime()) return false;
  return true;
}

/** Distinct, truthy values of one field across a collection, for filter dropdowns. */
export function uniqueValues<T, K extends keyof T>(items: T[], key: K): Array<NonNullable<T[K]>> {
  const seen = new Set<NonNullable<T[K]>>();
  items.forEach(item => {
    const value = item[key];
    if (value) seen.add(value as NonNullable<T[K]>);
  });
  return Array.from(seen);
}
