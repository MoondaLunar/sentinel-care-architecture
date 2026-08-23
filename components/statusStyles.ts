/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuditLog, CameraAttentionState, GDPRDeletionRequest } from '../types';

type GDPRStatus = GDPRDeletionRequest['status'];

/** Badge palette for audit ledger action types. */
export const AUDIT_ACTION_BADGE: Record<AuditLog['action'], string> = {
  CREATE: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  UPDATE: 'bg-blue-50 text-blue-700 border-blue-200/80',
  VIEW: 'bg-slate-100 text-slate-600 border-slate-200',
  SYNC_PUSH: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  SYNC_PULL: 'bg-purple-50 text-purple-700 border-purple-200/80',
  SECURITY_ALERT: 'bg-amber-50 text-amber-700 border-amber-200/80'
};

/** Badge palette for GDPR erasure request lifecycle states. */
export const GDPR_STATUS_BADGE: Record<GDPRStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
  VERIFIED: 'bg-blue-50 text-blue-700 border border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border border-emerald-250',
  REJECTED_RETAINED: 'bg-slate-100 text-slate-600 border border-slate-250'
};

/** Patient-facing wording of the request lifecycle. */
export const GDPR_STATUS_LABEL_PATIENT: Record<GDPRStatus, string> = {
  PENDING: 'Pending Review',
  VERIFIED: 'Identity Verified',
  COMPLETED: 'COMPLETED (Erased)',
  REJECTED_RETAINED: 'Rejected / Held'
};

/** Compliance-officer wording of the request lifecycle. */
export const GDPR_STATUS_LABEL_OFFICER: Record<GDPRStatus, string> = {
  PENDING: 'Pending Identity verification',
  VERIFIED: 'Verified (Erasure Approved)',
  COMPLETED: 'Completed (Erased)',
  REJECTED_RETAINED: 'Rejected (Legal Hold)'
};

/** Timeline dot palette for the GDPR status ledger. */
export const GDPR_TIMELINE_DOT: Record<GDPRStatus, string> = {
  PENDING: 'bg-amber-500',
  VERIFIED: 'bg-blue-500 animate-pulse',
  COMPLETED: 'bg-emerald-500',
  REJECTED_RETAINED: 'bg-slate-400'
};

/** Badge palette for the vision privacy lock attention states. */
export const CAMERA_STATE_BADGE: Record<CameraAttentionState, string> = {
  [CameraAttentionState.SAFE_FOCUS]: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  [CameraAttentionState.UNCERTAIN]: 'border-amber-200 text-amber-700 bg-amber-50',
  [CameraAttentionState.MULTI_PERSON]: 'border-red-200 text-red-700 bg-red-50',
  [CameraAttentionState.NO_FACE]: 'border-red-300 text-red-700 bg-red-50 animate-pulse'
};

/** Badge palette for hash-chain block integrity outcomes. */
export const INTEGRITY_BADGE: Record<'verified' | 'tampered' | 'pending', string> = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  tampered: 'bg-red-50 text-red-700 border-red-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200'
};
