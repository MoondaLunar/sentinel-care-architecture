/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GDPRDeletionRequest, UserSession, Patient, AuditLog } from '../types';
import { authorizedFetch, isValidVerificationToken } from '../security';
import { 
  Shield, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Search, 
  Mail, 
  FileCheck2, 
  AlertTriangle, 
  ArrowRight, 
  KeyRound, 
  RefreshCw, 
  HelpCircle,
  Copy,
  Check
} from 'lucide-react';

interface GDPRManagerProps {
  currentUser: UserSession;
  patients: Patient[];
  onLogAudit: (action: AuditLog['action'], reason: string) => void;
  triggerRefreshPatients: () => Promise<void>;
}

export default function GDPRManager({
  currentUser,
  patients,
  onLogAudit,
  triggerRefreshPatients
}: GDPRManagerProps) {
  // Mode: 'patient' or 'clinician'
  const [activeSubMode, setActiveSubMode] = useState<'patient' | 'clinician'>('patient');

  // GDPR Requests state
  const [requests, setRequests] = useState<GDPRDeletionRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states - Request submission
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [erasureReason, setErasureReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successRequest, setSuccessRequest] = useState<GDPRDeletionRequest | null>(null);

  // Verification Search states
  const [verificationInput, setVerificationInput] = useState('');
  const [verifiedRequest, setVerifiedRequest] = useState<GDPRDeletionRequest | null>(null);
  const [verifiedAuditLog, setVerifiedAuditLog] = useState<AuditLog | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Clinician Action states
  const [actionComment, setActionComment] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load requests (for clinician view or sync)
  const fetchRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authorizedFetch('/api/gdpr-requests');
      if (res.ok) {
        const data = await res.json();
        // Display newest requests first
        setRequests(data.reverse());
      } else {
        setError('Failed to load GDPR requests from server.');
      }
    } catch (err) {
      setError('Failed to connect to backend for GDPR data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [activeSubMode]);

  // Submit Deletion Request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessRequest(null);

    const targetPatient = patients.find(p => p.id === selectedPatientId);
    if (!targetPatient) {
      setError('Please select a valid patient file.');
      setSubmitting(false);
      return;
    }

    try {
      const res = await authorizedFetch('/api/gdpr-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientId: targetPatient.id,
          patientName: targetPatient.name,
          requesterEmail,
          reason: erasureReason
        })
      });

      if (res.ok) {
        const newReq = await res.json();
        setSuccessRequest(newReq);
        // Reset form
        setSelectedPatientId('');
        setRequesterEmail('');
        setErasureReason('');
        onLogAudit('SECURITY_ALERT', `Submitted GDPR Article 17 Erasure request for patient ${targetPatient.name} (ID: ${targetPatient.id})`);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to submit GDPR deletion request.');
      }
    } catch (err) {
      setError('Connection to compliance server failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Verify request
  const handleVerifyRequestToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const verificationCode = verificationInput.trim();
    if (!verificationCode) return;
    if (!isValidVerificationToken(verificationCode)) {
      setVerificationError('Invalid verification code format.');
      return;
    }

    setVerifying(true);
    setVerificationError(null);
    setVerifiedRequest(null);
    setVerifiedAuditLog(null);

    try {
      const res = await authorizedFetch(`/api/gdpr-requests/verify/${encodeURIComponent(verificationCode)}`);
      if (res.ok) {
        const data = await res.json();
        setVerifiedRequest(data.request);
        setVerifiedAuditLog(data.auditLog);
      } else {
        const errData = await res.json();
        setVerificationError(errData.error || 'No matching GDPR deletion record was found for this code.');
      }
    } catch (err) {
      setVerificationError('Error connecting to the compliance server.');
    } finally {
      setVerifying(false);
    }
  };

  // Clinician Action: VERIFY, REJECT, or COMPLETE
  const handleUpdateStatus = async (requestId: string, status: GDPRDeletionRequest['status']) => {
    setActionError(null);
    setActioningId(requestId);

    if (status === 'COMPLETED' || status === 'REJECTED_RETAINED') {
      if (!actionComment.trim()) {
        setActionError('A justification or validation comment is strictly required under HIPAA and GDPR rules.');
        setActioningId(null);
        return;
      }
    }

    try {
      const res = await authorizedFetch(`/api/gdpr-requests/${requestId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status,
          comment: actionComment
        })
      });

      if (res.ok) {
        setActionComment('');
        await fetchRequests();
        await triggerRefreshPatients();
        onLogAudit('SECURITY_ALERT', `GDPR deletion request status updated to ${status} for Request ID ${requestId}`);
      } else {
        const errData = await res.json();
        setActionError(errData.error || 'Failed to update request status.');
      }
    } catch (err) {
      setActionError('Connection failure.');
    } finally {
      setActioningId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6" id="gdpr-portal">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-250 font-bold uppercase tracking-wider">
            GDPR ARTICLE 17 COMPLIANCE
          </span>
          <h2 className="font-display font-semibold text-base text-slate-800 mt-1">
            Right to Erasure & Consent Center
          </h2>
          <p className="text-xs text-slate-500">
            Submit, process, and verify patient right-to-be-forgotten requests
          </p>
        </div>

        {/* SUB MODE SWITCHER */}
        <div className="bg-slate-100 p-1 border border-slate-200 rounded-lg flex items-center">
          <button
            onClick={() => setActiveSubMode('patient')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              activeSubMode === 'patient'
                ? 'bg-white text-slate-800 shadow border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Patient Portal
          </button>
          <button
            onClick={() => {
              setActiveSubMode('clinician');
              fetchRequests();
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              activeSubMode === 'clinician'
                ? 'bg-white text-slate-800 shadow border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Compliance Officer View
          </button>
        </div>
      </div>

      {/* =======================================================
          PATIENT PORTAL: SUBMIT & VERIFY
          ======================================================= */}
      {activeSubMode === 'patient' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
          {/* LEFT: SUBMIT REQUEST */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Submit Erasure Request
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Patients can request the deletion of their active medical files from the EMR system. Clinicians can also submit this on behalf of a physical patient signature.
              </p>
            </div>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {successRequest && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3 text-xs text-emerald-800 animate-fade-in">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-emerald-900 font-semibold">GDPR Deletion Request Registered!</strong>
                    <span>Your request has been received by the healthcare institution's HIPAA Privacy Officer.</span>
                  </div>
                </div>

                <div className="bg-white border border-emerald-150 p-3 rounded-lg space-y-2">
                  <span className="text-[10px] uppercase font-mono tracking-wide text-slate-400 block">
                    Your Immutable Verification Code:
                  </span>
                  <div className="flex items-center justify-between font-mono font-bold bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md text-slate-800 text-sm select-all">
                    <span>{successRequest.verificationToken}</span>
                    <button
                      onClick={() => copyToClipboard(successRequest.verificationToken)}
                      className="text-slate-400 hover:text-slate-600 transition p-1"
                      title="Copy code"
                    >
                      {copiedToken ? <Check className="w-4 h-4 text-emerald-650" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-550 leading-relaxed font-sans pt-1">
                    ⚠️ Save this code carefully! Use it in the right-hand panel at any time to verify that your data deletion request has been received, processed, and cryptographically completed in our system.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitRequest} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-655 font-semibold">Select Patient File to Erase *</label>
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-slate-350 focus:bg-white"
                >
                  <option value="">-- Choose patient directory file --</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (ID: {p.id}, Born: {p.birthdate})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-655 font-semibold">Requester Contact Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="patient@example.com"
                    value={requesterEmail}
                    onChange={(e) => setRequesterEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:border-slate-350 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-655 font-semibold">GDPR Right to Be Forgotten Reason / Justification *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="State the reason under GDPR Article 17 (e.g. 'Data is no longer necessary for the purposes of clinical evaluation, patient revoked consent, etc.')"
                  value={erasureReason}
                  onChange={(e) => setErasureReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-slate-350 focus:bg-white leading-relaxed"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[11px] leading-relaxed text-slate-550 space-y-1">
                <strong className="text-slate-705 block">🔒 Regulatory Compliance Overlap Notice:</strong>
                <span>GDPR Article 17 allows clinical erasure, but HIPAA data retention guidelines require keeping patient medical histories for specific timelines. Deletion requests will be reviewed by the Privacy Officer who will determine whether a total erasure or a legal retention lock applies.</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {submitting ? 'Registering GDPR Claim...' : 'Register GDPR Deletion Claim'}
              </button>
            </form>
          </div>

          {/* RIGHT: VERIFY RECEIVED & FOLLOWED */}
          <div className="space-y-4 border-t lg:border-t-0 lg:border-l border-slate-200 pt-6 lg:pt-0 lg:pl-8">
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Verify Request Receipt & Execution
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Transparency and verification are fundamental pillars of GDPR. Input your unique verification code or request ID to see exactly if, when, and how your request was followed.
              </p>
            </div>

            <form onSubmit={handleVerifyRequestToken} className="flex gap-2 text-xs">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Enter Verification Code (e.g. gdpr_verify_...)"
                  value={verificationInput}
                  onChange={(e) => setVerificationInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:border-slate-350 focus:bg-white font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={verifying}
                className="bg-slate-850 hover:bg-slate-900 text-white px-4 py-2 font-semibold rounded-lg transition disabled:opacity-50 shrink-0"
              >
                {verifying ? 'Checking...' : 'Verify'}
              </button>
            </form>

            {verificationError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{verificationError}</span>
              </div>
            )}

            {/* VERIFIED REQUEST DETAIL CONTAINER */}
            {verifiedRequest && (
              <div className="bg-slate-50 border border-slate-250 rounded-xl p-5 space-y-4 text-xs animate-fade-in">
                <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400">VERIFIED GDPR CLAIM</span>
                    <h4 className="font-semibold text-slate-800 text-sm mt-0.5">{verifiedRequest.patientName}</h4>
                    <span className="text-[10px] text-slate-450 block font-mono">Patient ID: {verifiedRequest.patientId}</span>
                  </div>

                  <span className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider font-bold ${
                    verifiedRequest.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    verifiedRequest.status === 'VERIFIED' ? 'bg-blue-50 text-blue-700 border border-blue-200 font-bold' :
                    verifiedRequest.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-250 font-bold' :
                    'bg-slate-100 text-slate-600 border border-slate-250'
                  }`}>
                    {verifiedRequest.status === 'PENDING' && 'Pending Review'}
                    {verifiedRequest.status === 'VERIFIED' && 'Identity Verified'}
                    {verifiedRequest.status === 'COMPLETED' && 'COMPLETED (Erased)'}
                    {verifiedRequest.status === 'REJECTED_RETAINED' && 'Rejected / Held'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-400 block font-mono uppercase text-[9px] tracking-wide">Request Date</span>
                    <span className="text-slate-700 font-medium">{new Date(verifiedRequest.requestDate).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-mono uppercase text-[9px] tracking-wide">Contact Registered</span>
                    <span className="text-slate-700 font-medium">{verifiedRequest.requesterEmail}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block font-mono uppercase text-[9px] tracking-wide mb-0.5">Right-to-Erasure Justification Given</span>
                  <p className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-600 leading-relaxed font-sans">{verifiedRequest.reason}</p>
                </div>

                {/* RECEIPTS / IMMUTABLE PROOFS OF COMPLIANCE */}
                {verifiedRequest.status === 'COMPLETED' && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-1.5 text-emerald-850 font-bold">
                      <FileCheck2 className="w-5 h-5 text-emerald-600" />
                      <span>OFFICIAL ERASURE VERIFICATION RECEIPT</span>
                    </div>

                    <p className="text-emerald-800 leading-relaxed text-[11px]">
                      This receipt stands as cryptographic and legal verification that the active patient clinical file has been completely and permanently deleted from our EMR. The erasure action was signed and logged into our compliance hash-chain ledger.
                    </p>

                    <div className="bg-white border border-emerald-150 p-3 rounded-lg space-y-2 font-mono text-[10px] text-slate-600 select-all">
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">ERASURE TIMESTAMP</span>
                        <strong>{verifiedRequest.completedAt ? new Date(verifiedRequest.completedAt).toLocaleString() : 'N/A'}</strong>
                      </div>
                      <div className="pt-1 border-t border-slate-100">
                        <span className="text-[9px] text-slate-400 block uppercase">BLOCK AUDIT SIGNATURE REFERENCED</span>
                        <span className="text-slate-800 font-semibold block break-all text-[9.5px] mt-0.5">{verifiedRequest.auditLogId || 'None'}</span>
                      </div>
                    </div>

                    {verifiedAuditLog && (
                      <div className="bg-emerald-650/5 border border-emerald-600/10 p-3 rounded-lg space-y-2 text-[10px]">
                        <span className="text-emerald-900 font-bold block uppercase font-mono tracking-wider">
                          Cryptographic Block Evidence Verified from Ledger:
                        </span>
                        <div className="space-y-1 text-slate-600 font-mono">
                          <div><span className="text-slate-450">Action Logged:</span> {verifiedAuditLog.action}</div>
                          <div><span className="text-slate-450">Audited Reason:</span> <span className="italic">"{verifiedAuditLog.reason}"</span></div>
                          <div><span className="text-slate-450">Prior Block Hash:</span> <span className="break-all text-slate-500 font-medium text-[9px]">{verifiedAuditLog.previousHash}</span></div>
                          <div><span className="text-slate-450">Present Block Hash:</span> <span className="break-all text-emerald-750 font-bold text-[9px]">{verifiedAuditLog.hash}</span></div>
                        </div>
                        <p className="text-[9px] text-emerald-800 italic leading-relaxed font-sans">
                          ✓ The hash signature of the present block perfectly verification-chains with the previous block, mathematically proving the active file was deleted and compliance logs have not been backdated.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* REJECTED / RETENTION FLOW */}
                {verifiedRequest.status === 'REJECTED_RETAINED' && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-2 text-amber-850">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <span>LEGAL HOLD & RETENTION LOCK ENFORCED</span>
                    </div>

                    <p className="text-amber-800 leading-relaxed text-[11px]">
                      Your request has been received, but the HIPAA Medical Record Retention Directive overrides the GDPR erasure request. State health guidelines require physical record preservation. Your file remains locked and securely archived.
                    </p>

                    {verifiedRequest.statusLog && verifiedRequest.statusLog.length > 0 && (
                      <div className="bg-white border border-amber-150 p-2.5 rounded-lg text-[10.5px]">
                        <span className="text-slate-400 uppercase font-mono text-[9px] tracking-wide block">Reason for Retention Hold:</span>
                        <p className="text-slate-700 italic mt-1 leading-relaxed font-medium">
                          "{verifiedRequest.statusLog[verifiedRequest.statusLog.length - 1].comment}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* TRACK REQUEST TIMELINE LOG */}
                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Compliance Status Ledger Timeline</span>
                  <div className="relative border-l border-slate-200 pl-4 ml-2.5 space-y-4">
                    {verifiedRequest.statusLog.map((log, index) => (
                      <div key={index} className="relative text-[11px] leading-normal">
                        {/* Dot marker */}
                        <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border border-white ${
                          log.status === 'PENDING' ? 'bg-amber-500' :
                          log.status === 'VERIFIED' ? 'bg-blue-500 animate-pulse' :
                          log.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-slate-400'
                        }`} />
                        <div className="flex items-center gap-2 text-slate-400 font-mono text-[9.5px]">
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                          <span>•</span>
                          <span className="font-semibold text-slate-500">{log.performedBy}</span>
                        </div>
                        <p className="text-slate-700 font-medium mt-0.5">{log.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =======================================================
          CLINICIAN VIEW: AUDIT & PROCESS GDPR FILES
          ======================================================= */}
      {activeSubMode === 'clinician' && (
        <div className="space-y-6 animate-fade-in text-xs">
          <div className="bg-blue-50/50 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-blue-900 block font-semibold">GDPR Officer Administrative Instructions</strong>
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Under GDPR Article 17, clinicians must (1) verify the identity of the requester to avoid data leaks, (2) determine if any medical obligations require retention (legal preservation holds), and (3) execute secure physical deletion from the EMR or record the hold reason. Every status transition creates a permanent cryptographic footprint.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 flex justify-center items-center gap-2 text-slate-450 font-medium">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
              Loading GDPR Requests Ledger...
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed rounded-xl border-slate-250 bg-slate-50/40">
              No active GDPR requests logged on this compliance server.
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => {
                const isActiveActioning = actioningId === req.id;
                return (
                  <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 hover:shadow-sm transition">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-3 border-b border-slate-200/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="font-semibold text-sm text-slate-800">{req.patientName}</strong>
                          <span className="text-[10px] font-mono font-bold bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">ID: {req.patientId}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>Request ID: {req.id}</span>
                          <span className="mx-2">•</span>
                          <span>Verification Code: <strong className="text-slate-600 select-all">{req.verificationToken}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider font-bold ${
                          req.status === 'PENDING' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          req.status === 'VERIFIED' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          req.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border border-emerald-250 font-bold' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {req.status === 'PENDING' && 'Pending Identity verification'}
                          {req.status === 'VERIFIED' && 'Verified (Erasure Approved)'}
                          {req.status === 'COMPLETED' && 'Completed (Erased)'}
                          {req.status === 'REJECTED_RETAINED' && 'Rejected (Legal Hold)'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] text-slate-600 leading-relaxed">
                      <div className="space-y-1 md:col-span-1">
                        <span className="text-[9px] uppercase font-mono text-slate-400 block tracking-wide">Requester details</span>
                        <div className="font-medium text-slate-700">{req.requesterEmail}</div>
                        <div className="text-slate-450 mt-1">Submitted on: {new Date(req.requestDate).toLocaleString()}</div>
                      </div>

                      <div className="space-y-1 md:col-span-2">
                        <span className="text-[9px] uppercase font-mono text-slate-400 block tracking-wide">Deletion Justification (GDPR Claim Reason)</span>
                        <p className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-700 italic">"{req.reason}"</p>
                      </div>
                    </div>

                    {/* COMPLIANCE FLOW OPTIONS */}
                    {req.status !== 'COMPLETED' && req.status !== 'REJECTED_RETAINED' && (
                      <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                        <label className="font-bold text-slate-705 flex items-center gap-1">
                          <HelpCircle className="w-4 h-4 text-slate-450" />
                          GDPR Compliance Officer Action Decision
                        </label>

                        {actionError && (
                          <p className="text-[11px] text-red-700 bg-red-50 p-2 border border-red-100 rounded">
                            ⚠️ {actionError}
                          </p>
                        )}

                        <div className="space-y-2">
                          <span className="text-[10px] text-slate-450 font-mono uppercase block">Compliance Justification Comment (Required for execution or rejection)</span>
                          <input
                            type="text"
                            placeholder="Enter justification comment (e.g., 'ID card verified. No HIPAA preservation requirements hold applicable' or 'HIPAA 6-year clinical preservation rule applies')"
                            value={actionComment}
                            onChange={(e) => {
                              setActionComment(e.target.value);
                              setActionError(null);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-xs focus:outline-none focus:border-slate-350 focus:bg-white focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        <div className="flex flex-wrap gap-2.5 pt-1">
                          {req.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateStatus(req.id, 'VERIFIED')}
                              disabled={isActiveActioning}
                              className="px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold transition flex items-center gap-1 text-[11px]"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verify Requester Identity
                            </button>
                          )}

                          {req.status === 'VERIFIED' && (
                            <button
                              onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                              disabled={isActiveActioning}
                              className="px-3.5 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg font-bold transition flex items-center gap-1 text-[11px]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Execute Erasure (Delete Patient File)
                            </button>
                          )}

                          <button
                            onClick={() => handleUpdateStatus(req.id, 'REJECTED_RETAINED')}
                            disabled={isActiveActioning}
                            className="px-3.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg font-bold transition flex items-center gap-1 text-[11px]"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject & Enforce HIPAA Legal Hold
                          </button>
                        </div>
                      </div>
                    )}

                    {/* RECEIPT PREVIEW (IF COMPLETED) */}
                    {req.status === 'COMPLETED' && req.auditLogId && (
                      <div className="bg-emerald-50/50 border border-emerald-200 p-3 rounded-lg flex items-center gap-2 text-[10.5px] text-emerald-800 font-mono">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <div>
                          <span>GDPR compliance erasure block recorded in hash-chain:</span>
                          <span className="block font-bold text-slate-800 mt-0.5 break-all font-semibold select-all">{req.auditLogId}</span>
                        </div>
                      </div>
                    )}

                    {/* STATUS TIMELINE LOG (CLINICIAN VIEW) */}
                    <div className="space-y-1 border-t border-slate-200/50 pt-2.5">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Timeline Log history</span>
                      <div className="space-y-1.5">
                        {req.statusLog.map((log, idx) => (
                          <div key={idx} className="flex justify-between text-[10px] bg-white border border-slate-150 p-2 rounded-lg">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-slate-700">{log.comment}</span>
                              <div className="text-slate-400">By: {log.performedBy}</div>
                            </div>
                            <span className="text-slate-400 text-right">{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
