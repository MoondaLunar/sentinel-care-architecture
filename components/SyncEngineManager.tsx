/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { SyncEvent, Patient, UserSession } from '../types';
import { Wifi, WifiOff, CloudLightning, Layers, RefreshCw, AlertTriangle, ArrowRight, Check, Database, Trash2, Clock } from 'lucide-react';

interface SyncEngineManagerProps {
  localPatients: Patient[];
  setLocalPatients: React.Dispatch<React.SetStateAction<Patient[]>>;
  currentUser: UserSession | null;
  onLogAudit: (action: 'CREATE' | 'UPDATE' | 'VIEW' | 'SYNC_PULL' | 'SYNC_PUSH' | 'SECURITY_ALERT', reason: string) => void;
  syncEvents: SyncEvent[];
  setSyncEvents: React.Dispatch<React.SetStateAction<SyncEvent[]>>;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  triggerServerFetch: () => Promise<void>;
}

export default function SyncEngineManager({
  localPatients,
  setLocalPatients,
  currentUser,
  onLogAudit,
  syncEvents,
  setSyncEvents,
  isOnline,
  setIsOnline,
  triggerServerFetch
}: SyncEngineManagerProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [backoffTimer, setBackoffTimer] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Sync History Ledger tracking status for each individual sync operation
  const [syncHistory, setSyncHistory] = useState<Array<{
    id: string;
    patientId: string;
    patientName: string;
    action: 'CREATE' | 'UPDATE';
    timestamp: string;
    status: 'success' | 'conflict' | 'error' | 'pending';
    error?: string;
    reason?: string;
  }>>([]);

  // For Conflict Resolution Dialog
  const [conflictEvent, setConflictEvent] = useState<{
    event: SyncEvent;
    serverPatient: Patient;
  } | null>(null);

  const backoffIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRemainingRef = useRef<number>(0);
  const isSyncingRef = useRef(false);

  // Synchronize new/untracked syncEvents into our persistent syncHistory ledger
  useEffect(() => {
    setSyncHistory(prev => {
      const updated = [...prev];
      syncEvents.forEach(evt => {
        const exists = updated.some(item => item.id === evt.id);
        if (!exists) {
          updated.push({
            id: evt.id,
            patientId: evt.patientId,
            patientName: evt.payload.name || 'Anonymous Patient',
            action: evt.action,
            timestamp: evt.timestamp,
            status: 'pending',
            reason: evt.reason
          });
        }
      });
      return updated;
    });
  }, [syncEvents]);

  // Exponential Backoff Retry Simulator Loop
  useEffect(() => {
    if (!isOnline) {
      // Clear timers if we go offline
      clearBackoff();
      return;
    }

    if (syncEvents.length > 0 && !isSyncing && backoffTimer === null) {
      // Something to sync, trigger immediate sync if retryCount is 0
      if (retryCount === 0) {
        attemptSync();
      } else {
        // Trigger backoff timer
        startBackoff();
      }
    }
  }, [syncEvents, isOnline, retryCount]);

  const startBackoff = () => {
    clearBackoff();
    // Exponential formula: 2^retryCount * 1000ms
    const delaySeconds = Math.min(30, Math.pow(2, retryCount));
    setBackoffTimer(delaySeconds);

    backoffRemainingRef.current = delaySeconds;

    // The countdown is driven from a ref so the fire happens outside of a state
    // updater, which React may invoke more than once per tick.
    backoffIntervalRef.current = setInterval(() => {
      backoffRemainingRef.current -= 1;
      if (backoffRemainingRef.current <= 0) {
        clearBackoff();
        attemptSync();
        return;
      }
      setBackoffTimer(backoffRemainingRef.current);
    }, 1000);
  };

  const clearBackoff = () => {
    if (backoffIntervalRef.current) {
      clearInterval(backoffIntervalRef.current);
      backoffIntervalRef.current = null;
    }
    backoffRemainingRef.current = 0;
    setBackoffTimer(null);
  };

  const attemptSync = async () => {
    if (syncEvents.length === 0 || !isOnline || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncError(null);

    // Set all pending items to active status
    setSyncHistory(prev => prev.map(item => {
      if (syncEvents.some(se => se.id === item.id)) {
        return { ...item, status: 'pending' };
      }
      return item;
    }));

    try {
      // Push the sync queue to the server
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': currentUser?.role || 'Provider',
          'X-User-Id': currentUser?.userId || 'anonymous'
        },
        body: JSON.stringify({ events: syncEvents })
      });

      if (!response.ok) {
        throw new Error(`Sync Server returned status ${response.status}`);
      }

      const data = await response.json();
      const results = data.results || [];
      
      let newSyncEvents = [...syncEvents];
      let hasConflicts = false;
      let hasErrors = false;

      const outcomes: Record<string, { status: 'success' | 'conflict' | 'error'; error?: string }> = {};

      // Handle outcomes of individual synced items
      for (const res of results) {
        if (res.status === 'success') {
          // Remove from sync queue
          newSyncEvents = newSyncEvents.filter(e => e.id !== res.eventId);
          // Update client with fresh server response
          updateLocalPatientInMemory(res.patient);
          outcomes[res.eventId] = { status: 'success' };
        } else if (res.status === 'conflict') {
          hasConflicts = true;
          outcomes[res.eventId] = { status: 'conflict', error: res.error || 'HIPAA Concurrency Conflict' };
          // Trigger conflict resolution dialog
          const eventToResolve = syncEvents.find(e => e.id === res.eventId);
          if (eventToResolve) {
            setConflictEvent({
              event: eventToResolve,
              serverPatient: res.serverPatient
            });
            // Stop syncing the rest until resolved
            break;
          }
        } else {
          // General errors
          hasErrors = true;
          setSyncError(`Sync event failed: ${res.error || 'Server error'}`);
          outcomes[res.eventId] = { status: 'error', error: res.error || 'Server error' };
        }
      }

      // Update syncHistory with outcomes
      setSyncHistory(prev => prev.map(item => {
        if (outcomes[item.id]) {
          return {
            ...item,
            status: outcomes[item.id].status,
            error: outcomes[item.id].error
          };
        }
        return item;
      }));

      if (newSyncEvents.length !== syncEvents.length) {
        setSyncEvents(newSyncEvents);
      }

      if (hasErrors) {
        // Rejected events stay queued, so escalate the backoff instead of
        // resetting it and re-pushing them immediately.
        setRetryCount(prev => prev + 1);
      } else if (!hasConflicts) {
        setRetryCount(0); // Reset backoff on full success
        await triggerServerFetch(); // Refresh local catalog
      }

    } catch (err: any) {
      console.error('Offline Sync error:', err);
      setSyncError(`Backend unreachable. Transitioning to backoff retry.`);
      setRetryCount(prev => prev + 1);
      
      // Update pending items to network error status
      setSyncHistory(prev => prev.map(item => {
        if (syncEvents.some(se => se.id === item.id)) {
          return { ...item, status: 'error', error: 'Network Connection Unreachable' };
        }
        return item;
      }));
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  const updateLocalPatientInMemory = (patient: Patient) => {
    setLocalPatients(prev => {
      const idx = prev.findIndex(p => p.id === patient.id);
      if (idx === -1) return [...prev, patient];
      const copy = [...prev];
      copy[idx] = patient;
      return copy;
    });
  };

  // ==========================================
  // CONFLICT RESOLVER ACTIONS
  // ==========================================

  const handleResolveOverwriteServer = async () => {
    if (!conflictEvent) return;
    const { event, serverPatient } = conflictEvent;

    // To overwrite the server, we submit the change with the server's CURRENT version number
    // this acts as an explicit resolution acknowledgment.
    const resolvedEvent: SyncEvent = {
      ...event,
      version: serverPatient.version, // bypass validation on server with server version
      reason: `[RECONCILED - MANUAL OVERWRITE] ${event.reason}`
    };

    // Update syncHistory to pending with reconciliation annotation
    setSyncHistory(prev => prev.map(item => {
      if (item.id === event.id) {
        return { ...item, status: 'pending', reason: `[RECONCILED - MANUAL OVERWRITE] ${event.reason}` };
      }
      return item;
    }));

    // Update event in queue and clear dialog
    setSyncEvents(prev => prev.map(e => e.id === event.id ? resolvedEvent : e));
    setConflictEvent(null);
    setRetryCount(0);
    // Sync again
    setTimeout(attemptSync, 100);
  };

  const handleResolveAcceptServer = () => {
    if (!conflictEvent) return;
    const { event, serverPatient } = conflictEvent;

    // Discard local edits, accept server version
    setSyncEvents(prev => prev.filter(e => e.id !== event.id));
    updateLocalPatientInMemory(serverPatient);
    setConflictEvent(null);
    onLogAudit('SECURITY_ALERT', `Sync conflict resolved: Provider accepted remote server state for patient ${serverPatient.name}.`);
    
    // Set status to success since it's resolved and current state matches server
    setSyncHistory(prev => prev.map(item => {
      if (item.id === event.id) {
        return { ...item, status: 'success', reason: `[RECONCILED - ACCEPTED REMOTE SERVER] ${event.reason}` };
      }
      return item;
    }));

    // Refresh rest of the sync
    setRetryCount(0);
  };

  const handleResolveMerge = () => {
    if (!conflictEvent) return;
    const { event, serverPatient } = conflictEvent;

    // Merging values field by field (local edits merge into server's base record)
    const mergedPatient: Patient = {
      ...serverPatient,
      name: event.payload.name || serverPatient.name,
      birthdate: event.payload.birthdate || serverPatient.birthdate,
      ssn: event.payload.ssn || serverPatient.ssn,
      diagnosis: event.payload.diagnosis || serverPatient.diagnosis,
      medications: event.payload.medications || serverPatient.medications,
      notes: `${serverPatient.notes}\n-- Merged Note --\n${event.payload.notes || ''}`
    };

    const resolvedEvent: SyncEvent = {
      ...event,
      payload: mergedPatient,
      version: serverPatient.version, // bypass
      reason: `[RECONCILED - MERGED] ${event.reason}`
    };

    // Update syncHistory with merge annotation
    setSyncHistory(prev => prev.map(item => {
      if (item.id === event.id) {
        return { ...item, status: 'pending', reason: `[RECONCILED - MERGED] ${event.reason}` };
      }
      return item;
    }));

    // Save locally
    updateLocalPatientInMemory(mergedPatient);
    // Replace event in queue
    setSyncEvents(prev => prev.map(e => e.id === event.id ? resolvedEvent : e));
    setConflictEvent(null);
    setRetryCount(0);
    onLogAudit('SECURITY_ALERT', `Sync conflict resolved: Provider manually merged conflicting updates for patient ${serverPatient.name}.`);
    // Retry
    setTimeout(attemptSync, 100);
  };

  const clearSyncQueue = () => {
    setSyncEvents([]);
    setConflictEvent(null);
    setRetryCount(0);
    setSyncError(null);
    setSyncHistory([]);
  };

  const successCount = syncHistory.filter(item => item.status === 'success').length;
  const failureCount = syncHistory.filter(item => item.status === 'error').length;
  const conflictCount = syncHistory.filter(item => item.status === 'conflict').length;
  const pendingCount = syncEvents.length;
  const totalHistoryCount = syncHistory.length;
  const completedCount = successCount + failureCount + conflictCount;
  const progressPercentage = totalHistoryCount > 0 ? Math.round((completedCount / totalHistoryCount) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4" id="sync-engine-panel">
      {/* Network connection toggle */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-blue-600" />
          <h3 className="font-display font-semibold text-sm tracking-tight text-slate-800">
            Local-First Sync System
          </h3>
        </div>
        <button
          onClick={() => {
            setIsOnline(!isOnline);
            setRetryCount(0);
            clearBackoff();
          }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono tracking-wider font-bold transition border ${
            isOnline
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          id="network-simulator-btn"
        >
          {isOnline ? (
            <>
              <Wifi className="w-3 h-3 text-emerald-600" />
              SIMULATOR: ONLINE
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-red-650 animate-pulse" />
              SIMULATOR: OFFLINE
            </>
          )}
        </button>
      </div>

      {/* Sync State Stats: Detailed Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 text-center" id="sync-metrics-dashboard">
        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 flex flex-col justify-between">
          <span className="text-[9px] font-mono uppercase text-slate-400 block font-semibold">Offline Queue</span>
          <span className="text-lg font-display font-bold text-slate-700 mt-1 block">
            {pendingCount}
          </span>
          <span className="text-[8px] text-slate-400 mt-0.5">Pending</span>
        </div>
        <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 flex flex-col justify-between">
          <span className="text-[9px] font-mono uppercase text-emerald-500 block font-semibold">Succeeded</span>
          <span className="text-lg font-display font-bold text-emerald-750 mt-1 block">
            {successCount}
          </span>
          <span className="text-[8px] text-emerald-500 mt-0.5">Successful</span>
        </div>
        <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 flex flex-col justify-between">
          <span className="text-[9px] font-mono uppercase text-amber-500 block font-semibold">Conflicts</span>
          <span className="text-lg font-display font-bold text-amber-750 mt-1 block">
            {conflictCount}
          </span>
          <span className="text-[8px] text-amber-500 mt-0.5">Resolved/Active</span>
        </div>
        <div className="bg-rose-50/50 p-2.5 rounded-lg border border-rose-100 flex flex-col justify-between">
          <span className="text-[9px] font-mono uppercase text-rose-500 block font-semibold">Failed</span>
          <span className="text-lg font-display font-bold text-rose-750 mt-1 block">
            {failureCount}
          </span>
          <span className="text-[8px] text-rose-500 mt-0.5">Errors</span>
        </div>
      </div>

      {/* Real-time Sync Progress Bar */}
      {totalHistoryCount > 0 && (
        <div className="bg-slate-50/60 border border-slate-100 p-3 rounded-lg space-y-2" id="sync-progress-tracker">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-600">
            <span className="flex items-center gap-1 font-semibold">
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Pushing and Verifying Event Registry...' : 'Registry Sync Idle'}
            </span>
            <span>{completedCount} / {totalHistoryCount} Operations Synced ({progressPercentage}%)</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                isSyncing ? 'bg-blue-600 animate-pulse' : progressPercentage === 100 ? 'bg-emerald-600' : 'bg-indigo-600'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Backoff Retry Display */}
      {backoffTimer !== null && (
        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-lg space-y-2 animate-fade-in">
          <div className="flex justify-between items-center text-xs text-amber-800 font-mono">
            <span className="flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Exponential Backoff Active
            </span>
            <span>Retrying in {backoffTimer}s</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-600 h-full transition-all duration-1000 ease-linear"
              style={{ width: `${(backoffTimer / Math.min(30, Math.pow(2, retryCount))) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-amber-700">
            Offline buffer retry attempt #{retryCount}. Delay matches clinical compliance backoff specifications.
          </p>
        </div>
      )}

      {syncError && (
        <p className="text-[10px] text-red-700 bg-red-50 border border-red-250 p-2.5 rounded">
          ⚠️ {syncError}
        </p>
      )}

      {/* Event queue detailed ledger breakdown */}
      {syncHistory.length > 0 && (
        <div className="space-y-2" id="sync-history-ledger-container">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1 font-semibold">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Interactive Operations Ledger
            </span>
            <button
              onClick={clearSyncQueue}
              className="text-[10px] text-red-650 hover:text-red-700 flex items-center gap-1 font-mono transition"
              id="clear-sync-ledger-btn"
            >
              <Trash2 className="w-3 h-3" /> Discard queue & history
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border border-slate-200 bg-slate-50/50 rounded-lg p-2.5 space-y-2 text-xs">
            {[...syncHistory].reverse().map((evt) => (
              <div 
                key={evt.id} 
                className="p-2 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-2 transition hover:border-slate-300"
                id={`sync-history-item-${evt.id}`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                      evt.action === 'CREATE' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-blue-50 text-blue-750 border border-blue-200'
                    }`}>
                      {evt.action}
                    </span>
                    <strong className="text-slate-800 truncate block max-w-[150px] sm:max-w-xs">{evt.patientName}</strong>
                    <span className="text-[9px] font-mono text-slate-400 ml-auto sm:ml-0">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {evt.reason && (
                    <p className="text-[10px] text-slate-500 italic truncate max-w-full">
                      Reason: {evt.reason}
                    </p>
                  )}
                  {evt.error && (
                    <p className="text-[9px] text-rose-650 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded font-mono inline-block max-w-full truncate">
                      {evt.error}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center sm:justify-end">
                  {evt.status === 'success' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200 select-none">
                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                      Synced
                    </span>
                  )}
                  {evt.status === 'conflict' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border bg-amber-50 text-amber-700 border-amber-200 select-none">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                      Conflict
                    </span>
                  )}
                  {evt.status === 'error' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border bg-rose-50 text-rose-700 border-rose-200 select-none">
                      <AlertTriangle className="w-2.5 h-2.5 text-rose-600" />
                      Failed
                    </span>
                  )}
                  {evt.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border bg-slate-100 text-slate-700 border-slate-200 animate-pulse select-none">
                      <RefreshCw className="w-2.5 h-2.5 text-slate-500 animate-spin" />
                      Pending Sync
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OFFLINE CAPABILITY DETAILS */}
      <div className="text-[11px] text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-200/60 flex gap-2">
        <Database className="w-5 h-5 text-slate-400 shrink-0" />
        <div>
          <strong>Offline-First State Sync:</strong> While offline, mutations write instantly to local buffer. Upon re-establishing server connection, queue executes automatically with optimistic verification to resolve clinical concurrency hazards.
        </div>
      </div>

      {/* CONFLICT RESOLUTION MODAL */}
      {conflictEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-xl p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h4 className="font-display font-semibold text-sm text-slate-850 flex items-center gap-1.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 animate-bounce" />
                  HIPAA Concurrency Conflict Detected
                </h4>
                <p className="text-xs text-slate-500">
                  Another clinician edited this patient file. Select resolution protocol to avoid data overwrite.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Local Offline Version */}
              <div className="bg-slate-50 p-4 border border-blue-250 rounded-lg space-y-3">
                <span className="font-mono text-[10px] uppercase text-blue-700 tracking-wider font-bold">
                  Your Local Offline Edits
                </span>
                <div className="space-y-2">
                  <p><span className="text-slate-400 block">Name:</span> <strong className="text-slate-800">{conflictEvent.event.payload.name || conflictEvent.serverPatient.name}</strong></p>
                  <p><span className="text-slate-400 block">Diagnosis:</span> <strong className="text-slate-800">{conflictEvent.event.payload.diagnosis || 'Unchanged'}</strong></p>
                  <p><span className="text-slate-400 block">Medications:</span> <strong className="text-slate-800">{conflictEvent.event.payload.medications || 'Unchanged'}</strong></p>
                  <p><span className="text-slate-400 block">Notes:</span> <strong className="text-slate-800">{conflictEvent.event.payload.notes || 'Unchanged'}</strong></p>
                  <p className="text-[10px] font-mono text-slate-400">BASE VERSION: v{conflictEvent.event.version}</p>
                </div>
              </div>

              {/* Server Version */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg space-y-3">
                <span className="font-mono text-[10px] uppercase text-amber-700 tracking-wider font-bold">
                  Server Active Record
                </span>
                <div className="space-y-2">
                  <p><span className="text-slate-400 block">Name:</span> <strong className="text-slate-800">{conflictEvent.serverPatient.name}</strong></p>
                  <p><span className="text-slate-400 block">Diagnosis:</span> <strong className="text-slate-800">{conflictEvent.serverPatient.diagnosis}</strong></p>
                  <p><span className="text-slate-400 block">Medications:</span> <strong className="text-slate-800">{conflictEvent.serverPatient.medications}</strong></p>
                  <p><span className="text-slate-400 block">Notes:</span> <strong className="text-slate-800">{conflictEvent.serverPatient.notes}</strong></p>
                  <p className="text-[10px] font-mono text-slate-400">SERVER VERSION: v{conflictEvent.serverPatient.version} (Updated by {conflictEvent.serverPatient.updatedBy})</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleResolveMerge}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
              >
                <Check className="w-4 h-4" />
                Merge Changes Field-by-Field
              </button>
              <button
                onClick={handleResolveOverwriteServer}
                className="flex-1 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
              >
                Force Overwrite Server
              </button>
              <button
                onClick={handleResolveAcceptServer}
                className="flex-1 py-2.5 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition"
              >
                Accept Server (Discard Mine)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
