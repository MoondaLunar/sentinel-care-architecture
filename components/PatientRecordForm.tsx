/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import AlertBanner from './AlertBanner';
import { FIELD_LABEL, INPUT, INPUT_MONO, PANEL, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXTAREA } from './uiClasses';

export interface PatientFormValues {
  name: string;
  birthdate: string;
  ssn: string;
  diagnosis: string;
  medications: string;
  notes: string;
}

interface PatientRecordFormProps {
  id: string;
  heading: React.ReactNode;
  submitLabel: React.ReactNode;
  values: PatientFormValues;
  onChange: (patch: Partial<PatientFormValues>) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  reasonPlaceholder: string;
  /** Example values are only helpful while creating a brand new file. */
  showPlaceholders?: boolean;
  error: string | null;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}

/**
 * Clinical record editor used for both file creation and revision. The
 * mandatory "reason for change" justification is part of the form because no
 * write may reach the ledger without it.
 */
export default function PatientRecordForm({
  id,
  heading,
  submitLabel,
  values,
  onChange,
  reason,
  onReasonChange,
  reasonPlaceholder,
  showPlaceholders = false,
  error,
  onSubmit,
  onCancel
}: PatientRecordFormProps) {
  const placeholder = (text: string) => (showPlaceholders ? text : undefined);

  return (
    <form onSubmit={onSubmit} className={`${PANEL} p-6 space-y-4 animate-fade-in`} id={id}>
      <h3 className="font-display font-semibold text-sm text-slate-800 border-b border-slate-200 pb-2.5">
        {heading}
      </h3>

      {error && (
        <AlertBanner variant="error" icon={AlertCircle} className="p-2.5">
          {error}
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-1.5">
          <label className={FIELD_LABEL}>Patient Full Name *</label>
          <input
            type="text"
            required
            placeholder={placeholder('e.g. Amanda Parker')}
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={INPUT}
          />
        </div>

        <div className="space-y-1.5">
          <label className={FIELD_LABEL}>Birthdate</label>
          <input
            type="date"
            value={values.birthdate}
            onChange={(e) => onChange({ birthdate: e.target.value })}
            className={INPUT_MONO}
          />
        </div>

        <div className="space-y-1.5">
          <label className={`${FIELD_LABEL} font-mono`}>SSN (Social Security Number)</label>
          <input
            type="text"
            placeholder={placeholder('000-00-0000')}
            value={values.ssn}
            onChange={(e) => onChange({ ssn: e.target.value })}
            className={INPUT_MONO}
          />
        </div>

        <div className="space-y-1.5">
          <label className={FIELD_LABEL}>Primary Diagnosis</label>
          <input
            type="text"
            placeholder={placeholder('e.g. Chronic Asthma exacerbation')}
            value={values.diagnosis}
            onChange={(e) => onChange({ diagnosis: e.target.value })}
            className={INPUT}
          />
        </div>
      </div>

      <div className="space-y-1.5 text-xs">
        <label className={FIELD_LABEL}>Active Medications</label>
        <input
          type="text"
          placeholder={placeholder('e.g. Albuterol, Fluticasone')}
          value={values.medications}
          onChange={(e) => onChange({ medications: e.target.value })}
          className={INPUT}
        />
      </div>

      <div className="space-y-1.5 text-xs">
        <label className={FIELD_LABEL}>Clinical Practitioner Progress Notes</label>
        <textarea
          rows={3}
          placeholder={placeholder('Type sensitive physician notes...')}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className={TEXTAREA}
        />
      </div>

      {/* MANDATORY REASON FOR CHANGE FIELD */}
      <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-xl space-y-2 text-xs">
        <label className="text-amber-800 font-bold flex items-center gap-1">
          <AlertTriangle className="w-4 h-4 text-amber-650 shrink-0" />
          Mandatory Security Justification *
        </label>
        <input
          type="text"
          required
          placeholder={reasonPlaceholder}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          className="w-full bg-white border border-amber-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-slate-400"
        />
        <p className="text-[10px] text-amber-700">
          To guarantee audit compliance under HIPAA rules, you must enter a justification reason. This is captured directly in the immutable cryptographic ledger.
        </p>
      </div>

      <div className="flex gap-3 justify-end pt-2 text-xs">
        <button type="button" onClick={onCancel} className={`px-4 py-2 ${SECONDARY_BUTTON}`}>
          Cancel
        </button>
        <button type="submit" className={`px-4 py-2 ${PRIMARY_BUTTON}`}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
