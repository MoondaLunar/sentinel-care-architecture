// SANITIZED FOR PUBLIC DEMO
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Eye, Shield, Download, Search, X, Calendar, Filter } from 'lucide-react';
import AlertBanner from './AlertBanner';
import ModalShell from './ModalShell';
import StatusPill from './StatusPill';
import { isWithinDateRange, matchesSearch, uniqueValues } from './filters';
import { formatTimestamp } from './formatting';
import { AUDIT_ACTION_BADGE, INTEGRITY_BADGE } from './statusStyles';
import { CAPTION, PANEL, SECONDARY_BUTTON } from './uiClasses';

type IntegrityType = 'verified' | 'tampered' | 'pending';

const INTEGRITY_ICON: Record<IntegrityType, React.ComponentType<{ className?: string }>> = {
  verified: Shield,
  tampered: AlertTriangle,
  pending: RefreshCw
};

const INTEGRITY_ICON_CLASS: Record<IntegrityType, string> = {
  verified: 'w-2.5 h-2.5 text-emerald-600 fill-emerald-100/30',
  tampered: 'w-2.5 h-2.5 text-red-600 animate-bounce',
  pending: 'w-2.5 h-2.5 text-amber-600 animate-spin'
};

const INTEGRITY_LABEL: Record<IntegrityType, string> = {
  verified: 'Verified',
  tampered: 'Tamper Detected',
  pending: 'Offline Pending'
};

interface AuditLogsViewProps {
  logs: AuditLog[];
  onRefresh: () => Promise<void>;
  onTriggerTamper: () => Promise<any>;
  onResetDatabase: () => Promise<void>;
}

// Client-side SHA-256 and hash-chain recomputation helpers
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeLogHashClient(log: AuditLog): Promise<string> {
  const dataString = 
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
    log.previousHash;
  return sha256(dataString);
}

export default function AuditLogsView({
  logs,
  onRefresh,
  onTriggerTamper,
  onResetDatabase
}: AuditLogsViewProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    corruptedLogIndex: number | null;
    corruptedLogId: string | null;
    totalLogsChecked: number;
  } | null>(null);
  
  const [selectedLogJson, setSelectedLogJson] = useState<AuditLog | null>(null);
  const [tamperAlert, setTamperAlert] = useState<string | null>(null);

  // Search and Filtering states
  const [searchText, setSearchText] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedActor, setSelectedActor] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Extract unique actors for the filter dropdown
  const uniqueActors = uniqueValues(logs, 'actorId');

  const filteredLogs = logs.filter(log => {
    if (!matchesSearch(searchText, [log.actorId, log.reason, log.patientName, log.patientId, log.id, log.hash])) {
      return false;
    }
    if (selectedAction !== 'ALL' && log.action !== selectedAction) {
      return false;
    }
    if (selectedActor !== 'ALL' && log.actorId !== selectedActor) {
      return false;
    }
    return isWithinDateRange(log.timestamp, startDate, endDate);
  });

  // Local re-calculation & verification state mapping log IDs to integrity statuses
  const [localVerification, setLocalVerification] = useState<Record<string, {
    verified: boolean;
    reason?: string;
    type?: IntegrityType;
  }>>({});

  // Automatically recalculate hash chain on local changes
  useEffect(() => {
    let active = true;

    async function runLocalVerification() {
      if (!logs || logs.length === 0) return;

      const result: Record<string, {
        verified: boolean;
        reason?: string;
        type?: IntegrityType;
      }> = {};

      // Reverse logs to chronological order (oldest first) to sequentially verify previous-hash chain linkages
      const chronological = [...logs].reverse();
      
      let chainBroken = false;
      let firstBrokenId: string | null = null;

      for (let i = 0; i < chronological.length; i++) {
        const log = chronological[i];

        // 1. Skip check or mark special for offline-pending mock logs
        if (log.hash === 'PENDING_OFFLINE_SYNC_HASH' || log.id.startsWith('mock_log_')) {
          result[log.id] = {
            verified: true,
            type: 'pending',
            reason: 'Buffered offline (Pending sync verification)'
          };
          continue;
        }

        // If the chain link has already been compromised earlier, subsequent blocks are affected
        if (chainBroken) {
          result[log.id] = {
            verified: false,
            type: 'tampered',
            reason: `Chain link broken due to prior tamper at block ID: ${firstBrokenId}`
          };
          continue;
        }

        // 2. Validate block digital signature
        const computed = await computeLogHashClient(log);
        if (computed !== log.hash) {
          chainBroken = true;
          firstBrokenId = log.id;
          result[log.id] = {
            verified: false,
            type: 'tampered',
            reason: 'Digital fingerprint mismatch (Block content has been altered)'
          };
          continue;
        }

        // 3. Validate previous hash link
        if (i === 0) {
          const genesisZero = '0000000000000000000000000000000000000000000000000000000000000000';
          if (log.previousHash !== genesisZero) {
            chainBroken = true;
            firstBrokenId = log.id;
            result[log.id] = {
              verified: false,
              type: 'tampered',
              reason: 'Genesis block previous hash link corrupted'
            };
            continue;
          }
        } else {
          const prevLog = chronological[i - 1];
          // Check if previous log's stored hash matches current log's previousHash
          if (log.previousHash !== prevLog.hash) {
            chainBroken = true;
            firstBrokenId = log.id;
            result[log.id] = {
              verified: false,
              type: 'tampered',
              reason: 'Hash linkage broken (Preceding block link mismatch)'
            };
            continue;
          }
        }

        // Correctly validated
        result[log.id] = {
          verified: true,
          type: 'verified',
          reason: 'Cryptographic digital signature verified'
        };
      }

      if (active) {
        setLocalVerification(result);
      }
    }

    runLocalVerification();

    return () => {
      active = false;
    };
  }, [logs]);

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const response = await fetch('/api/audit-logs/verify', { method: 'POST' });
      if (response.ok) {
        const result = await response.json();
        setVerificationResult(result);
      }
    } catch (err) {
      console.error('Integrity verification failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTamperSimulation = async () => {
    try {
      const res = await onTriggerTamper();
      if (res && res.tamperedLogId) {
        setTamperAlert(`Malicious alter simulation triggered! Log Block Index #${res.tamperedIndex} was forced-modified in-memory.`);
        await onRefresh();
        // Clear previous verification status to encourage re-running it
        setVerificationResult(null);
      }
    } catch (err: any) {
      alert(err.message || 'Cannot tamper: write at least 2 logs first.');
    }
  };

  const handleReset = async () => {
    if (confirm('Re-initialize standard compliant audit chain and databases to default pristine state?')) {
      await onResetDatabase();
      setVerificationResult(null);
      setTamperAlert(null);
      await onRefresh();
    }
  };

  const exportLogsAsJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "compliance_audit_ledger_export.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6" id="audit-trail-workspace">
      {/* Header compliance stats banner */}
      <div className={`${PANEL} flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <h2 className="font-display font-semibold text-lg text-slate-800">
              HIPAA Cryptographic Compliance Ledger
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            All workspace actions undergo secure cryptographic hash-chain anchoring. Deleted records or manual alterations break block verification checks immediately.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleVerifyIntegrity}
            disabled={isVerifying}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm"
            id="verify-chain-btn"
          >
            {isVerifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
            Verify Chain Integrity
          </button>

          <button
            onClick={exportLogsAsJson}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium text-xs rounded-lg flex items-center gap-1.5 transition shadow-sm"
            id="export-logs-btn"
          >
            <Download className="w-3.5 h-3.5" />
            Export Compliance JSON
          </button>
        </div>
      </div>

      {/* Simulator alerts panel */}
      {tamperAlert && (
        <AlertBanner
          variant="warning"
          iconSizeClass="w-5 h-5"
          iconClassName="text-amber-600 animate-pulse"
          title="⚠️ SIMULATED AUDIT TAMPERING ENGAGED"
          className="p-4 rounded-xl animate-fade-in"
        >
          <p>{tamperAlert}</p>
          <p className="text-[11px] text-amber-700">
            Click <strong>"Verify Chain Integrity"</strong> to see how the system immediately highlights the breach and traces the tamper block!
          </p>
        </AlertBanner>
      )}

      {/* Verification Output Banner */}
      {verificationResult && (
        <AlertBanner
          variant={verificationResult.verified ? 'success' : 'error'}
          icon={verificationResult.verified ? CheckCircle2 : XCircle}
          iconSizeClass="w-6 h-6"
          iconClassName={verificationResult.verified ? 'text-emerald-600' : 'text-red-600 animate-pulse'}
          className="p-5 rounded-xl animate-fade-in"
        >
          <div className="space-y-2">
            <h4 className="font-display font-semibold text-sm">
              {verificationResult.verified 
                ? 'Cryptographic Audit Trail Secure' 
                : 'SECURITY BREACH DETECTED: Chain Verification Broken!'}
            </h4>
            <p>
              {verificationResult.verified
                ? `Recalculated cryptographic hashes across all ${verificationResult.totalLogsChecked} sequential ledger events. All digital signatures successfully matched prior state snapshots.`
                : `A mismatch was discovered at log index #${verificationResult.corruptedLogIndex} (Block ID: ${verificationResult.corruptedLogId}). The hash parameters did not equate to sequential snapshot values.`}
            </p>
            <div className="flex gap-4 font-mono text-[10px] text-slate-400 uppercase">
              <span>Total blocks checked: <strong>{verificationResult.totalLogsChecked}</strong></span>
              <span>Status: <strong className={verificationResult.verified ? 'text-emerald-700' : 'text-red-700'}>{verificationResult.verified ? 'PASS' : 'COMPROMISED'}</strong></span>
            </div>
            {!verificationResult.verified && (
              <p className="text-[10px] text-red-700 italic font-semibold">
                Recommendation: Re-initialize the registry databases immediately to restore security guarantees.
              </p>
            )}
          </div>
        </AlertBanner>
      )}

      {/* Ledger Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Verification Controls Side panel */}
        <div className="space-y-4">
          <div className={`${PANEL} space-y-4 text-xs`}>
            <h3 className="font-display font-semibold text-slate-800">Compliance Audit Simulator</h3>
            <p className="text-slate-600 leading-relaxed">
              To test the immutability assurances of standard HIPAA log storage, click the button below to direct-inject a simulated unauthorized record edit on the server.
            </p>
            <button
              onClick={handleTamperSimulation}
              className="w-full py-2 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-semibold rounded-lg flex items-center justify-center gap-1.5 transition"
              id="tamper-logs-btn"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Simulate Ledger Tampering
            </button>
            <button
              onClick={handleReset}
              className="w-full py-2 bg-slate-50 text-slate-600 hover:text-slate-800 border border-slate-200 font-mono rounded-lg flex items-center justify-center gap-1.5 transition text-[11px]"
              id="reset-audit-btn"
            >
              <RefreshCw className="w-3 h-3" />
              Re-Initialize System
            </button>
          </div>

          <div className={`${PANEL} space-y-3.5 text-xs`}>
            <h3 className="font-display font-semibold text-slate-800">How the chain works</h3>
            <div className="space-y-3 font-mono text-[11px] text-slate-600">
              <div className="flex items-start gap-2">
                <span className="bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[10px] border border-blue-100 font-bold">1</span>
                <p>Every write captures precise before/after snapshots of the patient record.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[10px] border border-blue-100 font-bold">2</span>
                <p>A SHA-256 digital fingerprint is generated from patient snapshots, reason metadata, and the prior block's hash.</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-blue-50 px-1.5 py-0.5 rounded text-blue-700 text-[10px] border border-blue-100 font-bold">3</span>
                <p>Because each block locks the previous hash, any modification downstream triggers a cascading check failure.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger logs timeline column */}
        <div className={`lg:col-span-2 ${PANEL} space-y-4`}>
          <div className="flex justify-between items-center">
            <span className={CAPTION}>
              Chained Ledger Blocks ({filteredLogs.length} shown)
            </span>
            <button
              onClick={onRefresh}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 transition font-medium"
            >
              <RefreshCw className="w-3 h-3" /> Refresh Logs
            </button>
          </div>

          {/* Compliance Investigation Filter Panel */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3" id="audit-filters-panel">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Filter className="w-4 h-4 text-blue-600" />
              <span>Compliance Investigation Filters</span>
              {(searchText || selectedAction !== 'ALL' || selectedActor !== 'ALL' || startDate || endDate) && (
                <button
                  onClick={() => {
                    setSearchText('');
                    setSelectedAction('ALL');
                    setSelectedActor('ALL');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="ml-auto text-[10px] text-red-600 hover:text-red-700 font-mono font-bold flex items-center gap-0.5"
                  id="clear-all-filters"
                >
                  <X className="w-3 h-3" /> Clear Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Text Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search reason, patient, ID or hash..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                  id="audit-search-input"
                />
              </div>

              {/* Action and Actor Filter */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-700 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                  id="audit-action-select"
                >
                  <option value="ALL">All Actions</option>
                  <option value="CREATE">CREATE</option>
                  <option value="UPDATE">UPDATE</option>
                  <option value="VIEW">VIEW</option>
                  <option value="SYNC_PUSH">SYNC_PUSH</option>
                  <option value="SYNC_PULL">SYNC_PULL</option>
                  <option value="SECURITY_ALERT">SECURITY_ALERT</option>
                </select>

                <select
                  value={selectedActor}
                  onChange={(e) => setSelectedActor(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-700 focus:outline-none focus:border-blue-500 truncate font-medium cursor-pointer"
                  id="audit-actor-select"
                >
                  <option value="ALL">All Actors</option>
                  {uniqueActors.map(actor => (
                    <option key={actor} value={actor}>{actor}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
              {/* Date Filters */}
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[10px] font-medium text-slate-500 uppercase font-mono w-14">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-grow bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-750 focus:outline-none focus:border-blue-500 font-medium"
                  id="audit-start-date"
                />
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[10px] font-medium text-slate-500 uppercase font-mono w-14">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-grow bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-750 focus:outline-none focus:border-blue-500 font-medium"
                  id="audit-end-date"
                />
              </div>
            </div>

            {/* Filter Results Info */}
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-1">
              <span>Showing <strong>{filteredLogs.length}</strong> of {logs.length} blocks</span>
              {filteredLogs.length !== logs.length && (
                <span className="text-blue-600 font-bold">Filters Active</span>
              )}
            </div>
          </div>

          <div className="space-y-6 relative border-l border-slate-200 pl-5 ml-2 max-h-[500px] overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/30" id="no-filtered-logs-alert">
                <FileSpreadsheet className="w-8 h-8 text-slate-350 mx-auto animate-pulse" />
                <p className="text-xs font-semibold">No ledger blocks match your active search criteria.</p>
                <p className="text-[11px] text-slate-450">Try broadening your search query or reset dates.</p>
              </div>
            ) : (
              filteredLogs.map((log, index) => {
                const localStatus = localVerification[log.id];
                const isLocalTampered = localStatus?.type === 'tampered';
                const isCorrupted = (verificationResult && !verificationResult.verified && verificationResult.corruptedLogId === log.id) || isLocalTampered;
                
                const originalIndex = logs.findIndex(l => l.id === log.id);
                const displayIndex = originalIndex !== -1 ? logs.length - originalIndex : filteredLogs.length - index;

                return (
                  <div
                    key={log.id}
                    className={`relative group p-4 rounded-lg border transition-all ${
                      isCorrupted
                        ? 'bg-red-50 border-red-400 shadow-md'
                        : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                    id={`audit-log-block-${index}`}
                  >
                    {/* Cryptographic chain bullet node */}
                    <div className={`absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full border-2 ${
                      isCorrupted
                        ? 'bg-red-600 border-red-400 animate-ping'
                        : 'bg-white border-blue-650'
                    }`} />

                    <div className="flex flex-wrap justify-between items-start gap-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono border uppercase ${AUDIT_ACTION_BADGE[log.action]}`}>
                            {log.action}
                          </span>
                          <span className="text-slate-700 font-medium">Block Index #{displayIndex}</span>
                        
                        {/* Real-time local verification status badge */}
                        {localStatus?.type && (
                          <StatusPill
                            className={INTEGRITY_BADGE[localStatus.type]}
                            icon={INTEGRITY_ICON[localStatus.type]}
                            iconClassName={INTEGRITY_ICON_CLASS[localStatus.type]}
                            label={INTEGRITY_LABEL[localStatus.type]}
                            title={localStatus.reason}
                            id={`local-integrity-badge-${log.id}`}
                          />
                        )}

                        {isCorrupted && !isLocalTampered && (
                          <span className="text-[9px] font-bold text-red-700 bg-red-100 px-2 py-0.5 border border-red-350 rounded">
                            MISMATCH DETECTED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-800 font-display font-medium pt-1">
                        Reason: {log.reason}
                      </p>
                    </div>

                    <div className="text-right text-[10px] font-mono text-slate-400">
                      <div>{formatTimestamp(log.timestamp)}</div>
                      <div>Actor: {log.actorId} <span className="text-slate-500">({log.actorRole})</span></div>
                    </div>
                  </div>

                  {log.patientName && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-xs flex gap-2">
                      <span className="text-slate-400">Target patient:</span>
                      <strong className="text-slate-800">{log.patientName} <span className="text-[10px] font-mono text-slate-400">({log.patientId})</span></strong>
                    </div>
                  )}

                  {/* Hash Signature Metadata Footer */}
                  <div className="mt-3 bg-white p-2.5 rounded border border-slate-200 space-y-1 font-mono text-[9px]">
                    <div className="flex items-center justify-between text-slate-400 hover:text-slate-500 transition cursor-pointer" onClick={() => setSelectedLogJson(log)}>
                      <span>DIGITAL FINGERPRINT (SHA-256):</span>
                      <span className="text-blue-600 flex items-center gap-0.5 hover:underline text-[8px] uppercase font-bold">
                        <Eye className="w-3 h-3" /> View snapshots
                      </span>
                    </div>
                    <div className="text-slate-700 truncate tracking-wider selection:bg-blue-500/20">{log.hash}</div>
                    <div className="flex justify-between text-slate-400 pt-0.5">
                      <span className="truncate max-w-[250px]">PREV_HASH: <span className="text-slate-600 select-all">{log.previousHash.slice(0, 16)}...</span></span>
                      <span>BLOCK: {log.id.slice(4, 12)}...</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </div>
      </div>

      {/* SNAPSHOT VIEWER MODAL */}
      {selectedLogJson && (
        <ModalShell
          title={<span className="uppercase">Audit Snapshot Details</span>}
          subtitle={<span className="font-mono">BLOCK ID: {selectedLogJson.id}</span>}
          onClose={() => setSelectedLogJson(null)}
          maxWidthClass="max-w-xl"
          dividedHeader
        >
          <div className="space-y-4 text-xs font-mono max-h-[350px] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-slate-400 uppercase tracking-wide block text-[10px]">BEFORE STATE SNAPSHOT</span>
                <pre className="bg-slate-50 p-3 rounded-lg border border-slate-200 overflow-x-auto text-[10px] text-slate-700 leading-relaxed max-h-56">
                  {selectedLogJson.beforeState 
                    ? JSON.stringify(JSON.parse(selectedLogJson.beforeState), null, 2) 
                    : 'null (Genesis/Create Action)'}
                </pre>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 uppercase tracking-wide block text-[10px]">AFTER STATE SNAPSHOT</span>
                <pre className="bg-slate-50 p-3 rounded-lg border border-slate-200 overflow-x-auto text-[10px] text-blue-700/90 leading-relaxed max-h-56">
                  {selectedLogJson.afterState 
                    ? JSON.stringify(JSON.parse(selectedLogJson.afterState), null, 2) 
                    : 'null (View/Read Action)'}
                </pre>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 text-[11px] text-slate-800">
              <p className="text-slate-400 font-bold">DIGITAL ANCHOR BLOCK DETAILS:</p>
              <p><span className="text-slate-400">Actor:</span> {selectedLogJson.actorId} ({selectedLogJson.actorRole})</p>
              <p><span className="text-slate-400">Timestamp:</span> {selectedLogJson.timestamp}</p>
              <p><span className="text-slate-400">Reason:</span> {selectedLogJson.reason}</p>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setSelectedLogJson(null)}
              className={`w-full py-2 ${SECONDARY_BUTTON} text-xs`}
            >
              Close Snapshot Reviewer
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
