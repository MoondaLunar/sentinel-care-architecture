/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConsultModeState } from '../types';

type ConsultFields = ConsultModeState['selectedFields'];
type ConsultField = keyof ConsultFields;

/** Consult Mode session length, in seconds. */
export const CONSULT_SESSION_SECONDS = 300;

/** Every clinical field exposed — the workspace default outside Consult Mode. */
export const ALL_FIELDS_VISIBLE: ConsultFields = {
  name: true,
  birthdate: true,
  ssn: true,
  diagnosis: true,
  medications: true,
  notes: true
};

/** Inactive Consult Mode state: no masking, no timer. */
export function inactiveConsultState(): ConsultModeState {
  return {
    isActive: false,
    timeLeft: 0,
    selectedFields: { ...ALL_FIELDS_VISIBLE }
  };
}

/** Human-readable field name (`ssn` renders as an acronym, not a word). */
export function consultFieldLabel(field: ConsultField | string): string {
  return field === 'ssn' ? 'SSN' : field;
}
