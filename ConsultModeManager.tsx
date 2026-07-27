/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ConsultModeState } from '../types';
import { ShieldCheck, Eye, EyeOff, KeyRound, AlertTriangle, RefreshCw, X, ShieldAlert } from 'lucide-react';

interface ConsultModeManagerProps {
  consultState: ConsultModeState;
  onChange: (state: ConsultModeState) => void;
  onLogAudit: (action: 'CREATE' | 'UPDATE' | 'VIEW' | 'SYNC_PULL' | 'SYNC_PUSH' | 'SECURITY_ALERT', reason: string) => void;
}

export default function ConsultModeManager({
  consultState,
  onChange,
  onLogAudit
}: ConsultModeManagerProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Local temporary selection fields
  const [tempFields, setTempFields] = useState(consultState.selectedFields);

  // Default PIN for simulated physician badge re-auth
  const CLINICAL_PIN = '1234';
  // SIMULATION ONLY - NEVER USE IN PRODUCTION

  // Timer countdown handler
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (consultState.isActive) {
      interval = setInterval(() => {
        if (consultState.timeLeft <= 1) {
          // Force expire Consult Mode
          onChange({
            isActive: false,
            timeLeft: 0,
            selectedFields: {
              name: true,
              birthdate: true,
              ssn: true,
              diagnosis: true,
              medications: true,
              notes: true
            }
          });
          onLogAudit('SECURITY_ALERT', 'Consult Mode session expired automatically after 5-minute timeout.');
        } else {
          onChange({
            ...consultState,
            timeLeft: consultState.timeLeft - 1
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [consultState.isActive, consultState.timeLeft]);

  const handleFieldToggle = (field: keyof ConsultModeState['selectedFields']) => {
    setTempFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleStartConsultRequest = () => {
    // Open re-auth passcode dialog
    setShowAuthModal(true);
    setPinInput('');
    setAuthError(null);
  };

  const handleAuthenticate = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === CLINICAL_PIN) {
      // Re-authentication success! Activate Consult Mode
      const selectedFieldNames = Object.entries(tempFields)
        .filter(([_, value]) => value)
        .map(([key]) => key.toUpperCase())
        .join(', ');

      onChange({
        isActive: true,
        timeLeft: 300, // 5 minutes
        selectedFields: tempFields
      });
      setShowAuthModal(false);
      setAuthError(null);

      onLogAudit(
        'SECURITY_ALERT',
        `Activated HIPAA Consult Mode. Badge/PIN re-authenticated. Restricted viewport fields: [${selectedFieldNames}]`
      );
    } else {
      setAuthError('Invalid Clinical Provider PIN. Please use default PIN: 1234 for simulation.');
      setPinInput('');
    }
  };

  const handleProlongSession = () => {
    // Renew timer easily
    onChange({
      ...consultState,
      timeLeft: 300
    });
    onLogAudit('SECURITY_ALERT', 'HIPAA Consult Mode session prolonged by provider re-authentication.');
  };

  const handleExitConsult = () => {
    onChange({
      isActive: false,
      timeLeft: 0,
      selectedFields: {
        name: true,
        birthdate: true,
        ssn: true,
        diagnosis: true,
        medications: true,
        notes: true
      }
    });
    onLogAudit('SECURITY_ALERT', 'Provider voluntarily exited Consult Mode. Restored default workspace viewport permissions.');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isWarningState = consultState.isActive && consultState.timeLeft <= 120; // 2 minutes or less

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4" id="consult-mode-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h3 className="font-display font-semibold text-sm tracking-tight text-slate-800">
            Clinical Consult Privacy Boundary
          </h3>
        </div>
        {consultState.isActive && (
          <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
            isWarningState
              ? 'bg-red-50 border-red-200 text-red-700 animate-pulse'
              : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isWarningState ? 'bg-red-600' : 'bg-blue-500'}`} />
            CONSULT MODE ACTIVE
          </span>
        )}
      </div>

      {!consultState.isActive ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-200/60">
            💡 <strong>Screen-Sharing Safeguards:</strong> Entering Consult Mode hides unauthorized data before showing screens to patients. Check only the fields you wish to display.
          </p>

          {/* Selector Fields Grid */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 space-y-2.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
              Visible Clinical Fields (Select to expose)
            </span>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {Object.keys(tempFields).map((fieldKey) => {
                const key = fieldKey as keyof ConsultModeState['selectedFields'];
                const isSelected = tempFields[key];
                return (
                  <button
                    key={key}
                    onClick={() => handleFieldToggle(key)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border transition ${
                      isSelected
                        ? 'bg-blue-550/10 border-blue-400 text-blue-850 font-medium'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <span className="capitalize">{key === 'ssn' ? 'SSN' : key}</span>
                    {isSelected ? <Eye className="w-3.5 h-3.5 text-blue-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleStartConsultRequest}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 active:translate-y-px transition text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10"
            id="start-consult-btn"
          >
            <KeyRound className="w-3.5 h-3.5 text-white" />
            Badge Re-Authenticate & Start Consult
          </button>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {/* Active Countdown Box */}
          <div className={`p-4 rounded-lg border ${
            isWarningState ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-800'
          } text-center space-y-2`}>
            {isWarningState && (
              <div className="flex items-center justify-center gap-1.5 text-red-600 text-[11px] font-mono uppercase tracking-wider animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-600" /> EXPIRE WARNING
              </div>
            )}
            <span className="text-3xl font-display font-bold block tracking-wider" id="consult-countdown">
              {formatTime(consultState.timeLeft)}
            </span>
            <p className="text-[10px] text-slate-500">
              {isWarningState 
                ? 'Viewport will automatically lock patient files in under 2 minutes for compliance.' 
                : 'Showing curated viewport parameters to secondary viewer.'}
            </p>
          </div>

          {/* Active Fields List */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 space-y-2">
            <span className="text-[10px] font-mono uppercase text-slate-400">Exposed fields in this session:</span>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {Object.entries(consultState.selectedFields).map(([key, value]) => (
                <span
                  key={key}
                  className={`px-2 py-0.5 rounded-full border ${
                    value
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-slate-200/60 text-slate-400 line-through'
                  }`}
                >
                  {key === 'ssn' ? 'SSN' : key}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleProlongSession}
              className="flex-1 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 border border-slate-250"
              id="renew-consult-btn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Renew Timer
            </button>
            <button
              onClick={handleExitConsult}
              className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1.5"
              id="exit-consult-btn"
            >
              <X className="w-3.5 h-3.5" />
              Exit Consult
            </button>
          </div>
        </div>
      )}

      {/* RE-AUTHENTICATION CODE-LOCK PIN DIALOG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h4 className="font-display font-semibold text-sm text-slate-850 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-blue-600" />
                  Physician Badge Re-Auth
                </h4>
                <p className="text-[11px] text-slate-500">
                  Verify credential status before shifting clinical view permissions.
                </p>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAuthenticate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                  Enter 4-Digit Badge PIN (Simulated Default: <strong className="text-blue-600">1234</strong>)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPinInput(val);
                    setAuthError(null);
                  }}
                  placeholder="••••"
                  autoFocus
                  className="w-full text-center text-2xl font-mono tracking-[1em] py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
                />
              </div>

              {authError && (
                <p className="text-[10px] text-red-700 bg-red-50 p-2 border border-red-100 rounded">
                  ⚠️ {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={pinInput.length !== 4}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:translate-y-px transition text-white text-xs font-bold rounded-lg disabled:opacity-40"
              >
                Confirm Biometric / PIN Verification
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
