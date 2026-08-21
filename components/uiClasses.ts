/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Standard white surface used by every top-level feature panel. */
export const PANEL =
  'bg-white border border-slate-200 rounded-xl p-5 shadow-sm';

/** Muted explanatory note block ("HIPAA lock", "offline-first", ...). */
export const INFO_NOTE =
  'text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-200/60';

/** Text/select/textarea control on a muted background. */
export const INPUT =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-slate-350 focus:bg-white focus:ring-1 focus:ring-blue-500';

/** Monospaced variant of `INPUT` for identifiers (SSN, dates, tokens). */
export const INPUT_MONO = `${INPUT} font-mono`;

/** Multi-line variant of `INPUT`. */
export const TEXTAREA = `${INPUT} leading-relaxed`;

/** Label sitting above a form control. */
export const FIELD_LABEL = 'text-slate-650 font-medium';

export const PRIMARY_BUTTON =
  'bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-sm disabled:opacity-50';

export const SECONDARY_BUTTON =
  'bg-white hover:bg-slate-50 text-slate-600 font-medium rounded-lg border border-slate-250 transition';

/** Full-screen dimmed backdrop shared by all modal dialogs. */
export const MODAL_OVERLAY =
  'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in';

/** Modal card sitting on top of `MODAL_OVERLAY`. */
export const MODAL_CARD =
  'bg-white border border-slate-200 w-full rounded-xl p-6 shadow-2xl space-y-4';

/** Small uppercase monospaced caption used for section headers. */
export const CAPTION =
  'text-[10px] font-mono uppercase tracking-wider text-slate-400';
