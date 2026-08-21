// SANITIZED FOR PUBLIC DEMO
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Provider' | 'Admin' | 'Auditor';

export interface UserSession {
  userId: string;
  userName: string;
  role: UserRole;
}

export interface Patient {
  id: string;
  name: string;
  birthdate: string;
  ssn: string;
  diagnosis: string;
  medications: string;
  notes: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  action: 'CREATE' | 'UPDATE' | 'VIEW' | 'SYNC_PUSH' | 'SYNC_PULL' | 'SECURITY_ALERT';
  patientId?: string;
  patientName?: string;
  beforeState?: string;
  afterState?: string;
  reason: string;
  hash: string;
  previousHash: string;
}

export interface GDPRStatusLogEntry {
  status: GDPRDeletionRequest['status'];
  timestamp: string;
  performedBy: string;
  comment: string;
}

export interface GDPRDeletionRequest {
  id: string;
  patientId: string;
  patientName: string;
  requesterEmail: string;
  reason: string;
  requestDate: string;
  status: 'PENDING' | 'VERIFIED' | 'COMPLETED' | 'REJECTED_RETAINED';
  verificationToken: string;
  statusLog: GDPRStatusLogEntry[];
  completedAt?: string;
  auditLogId?: string;
}

export interface SyncEvent {
  id: string;
  patientId: string;
  action: 'CREATE' | 'UPDATE';
  payload: Patient;
  version: number;
  timestamp: string;
  reason: string;
}

export interface ConsultModeState {
  isActive: boolean;
  timeLeft: number;
  selectedFields: {
    name: boolean;
    birthdate: boolean;
    ssn: boolean;
    diagnosis: boolean;
    medications: boolean;
    notes: boolean;
  };
}

export enum CameraAttentionState {
  SAFE_FOCUS = 'SAFE_FOCUS',
  UNCERTAIN = 'UNCERTAIN',
  MULTI_PERSON = 'MULTI_PERSON',
  NO_FACE = 'NO_FACE'
}
