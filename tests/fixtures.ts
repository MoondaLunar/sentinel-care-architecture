/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuditLog,
  ConsultModeState,
  GDPRDeletionRequest,
  Patient,
  SyncEvent,
  UserSession
} from '../types';

export const GENESIS_HASH = '0'.repeat(64);

export function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pat_1',
    name: 'Amanda Parker',
    birthdate: '1984-02-11',
    ssn: '000-00-0000',
    diagnosis: 'Chronic asthma',
    medications: 'Albuterol',
    notes: 'Stable on current regimen.',
    version: 3,
    updatedAt: '2024-05-01T10:00:00.000Z',
    updatedBy: 'dr.smith',
    ...overrides
  };
}

export function makeUser(overrides: Partial<UserSession> = {}): UserSession {
  return { userId: 'u_1', userName: 'Dr. Smith', role: 'Provider', ...overrides };
}

export function makeConsultState(
  overrides: Partial<Omit<ConsultModeState, 'selectedFields'>> & {
    selectedFields?: Partial<ConsultModeState['selectedFields']>;
  } = {}
): ConsultModeState {
  const { selectedFields, ...rest } = overrides;
  return {
    isActive: false,
    timeLeft: 0,
    ...rest,
    selectedFields: {
      name: true,
      birthdate: true,
      ssn: true,
      diagnosis: true,
      medications: true,
      notes: true,
      ...selectedFields
    }
  };
}

export function makeSyncEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  return {
    id: 'evt_1',
    patientId: 'pat_1',
    action: 'UPDATE',
    payload: makePatient(),
    version: 3,
    timestamp: '2024-05-01T10:00:00.000Z',
    reason: 'Updated medication list',
    ...overrides
  };
}

export function makeGdprRequest(overrides: Partial<GDPRDeletionRequest> = {}): GDPRDeletionRequest {
  return {
    id: 'gdpr_1',
    patientId: 'pat_1',
    patientName: 'Amanda Parker',
    requesterEmail: 'amanda@example.com',
    reason: 'Consent revoked',
    requestDate: '2024-05-01T10:00:00.000Z',
    status: 'PENDING',
    verificationToken: 'gdpr_verify_abc123',
    statusLog: [
      {
        status: 'PENDING',
        timestamp: '2024-05-01T10:00:00.000Z',
        performedBy: 'amanda@example.com',
        comment: 'Request submitted by patient.'
      }
    ],
    ...overrides
  };
}

/** Mirrors the hash payload layout used by AuditLogsView. */
async function sha256(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeLogHash(log: AuditLog): Promise<string> {
  return sha256(
    log.id +
      log.timestamp +
      log.actorId +
      log.actorRole +
      log.action +
      (log.patientId || '') +
      (log.patientName || '') +
      (log.beforeState || '') +
      (log.afterState || '') +
      log.reason +
      log.previousHash
  );
}

type LogSeed = Partial<Omit<AuditLog, 'hash' | 'previousHash'>>;

/**
 * Builds a cryptographically consistent chain and returns it newest-first,
 * which is the order AuditLogsView expects from the server.
 */
export async function buildLogChain(seeds: LogSeed[]): Promise<AuditLog[]> {
  const chronological: AuditLog[] = [];
  let previousHash = GENESIS_HASH;

  for (const [index, seed] of seeds.entries()) {
    const log: AuditLog = {
      id: `log_${index + 1}`,
      timestamp: `2024-05-0${index + 1}T10:00:00.000Z`,
      actorId: 'dr.smith',
      actorRole: 'Provider',
      action: 'CREATE',
      reason: `Ledger event ${index + 1}`,
      ...seed,
      previousHash,
      hash: ''
    };
    log.hash = await computeLogHash(log);
    previousHash = log.hash;
    chronological.push(log);
  }

  return chronological.reverse();
}
