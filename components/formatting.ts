/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Absolute date + time rendering used across every compliance ledger view. */
export function formatTimestamp(value: string | number | Date): string {
  return new Date(value).toLocaleString();
}

/** Time-only rendering for high-frequency operational feeds (sync ledger). */
export function formatTimeOfDay(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString();
}

/** `m:ss` countdown rendering for session timers. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
