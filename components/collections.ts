/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface Identifiable {
  id: string;
}

/** Returns a new list with `patch` applied to every item matching `predicate`. */
export function patchWhere<T>(items: T[], predicate: (item: T) => boolean, patch: Partial<T>): T[] {
  return items.map(item => (predicate(item) ? { ...item, ...patch } : item));
}

/** Returns a new list with `patch` applied to the item carrying `id`. */
export function patchById<T extends Identifiable>(items: T[], id: string, patch: Partial<T>): T[] {
  return patchWhere(items, item => item.id === id, patch);
}

/** Returns a new list with `item` replacing the entry of the same id, or appended. */
export function upsertById<T extends Identifiable>(items: T[], item: T): T[] {
  const index = items.findIndex(candidate => candidate.id === item.id);
  if (index === -1) return [...items, item];
  const copy = [...items];
  copy[index] = item;
  return copy;
}
