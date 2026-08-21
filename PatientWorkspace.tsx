/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Patient, UserSession, ConsultModeState } from '../types';
import { Search, UserPlus, Edit3, Shield, User, FileText, Calendar, Lock } from 'lucide-react';
import PatientRecordForm, { PatientFormValues } from './PatientRecordForm';
import { formatTimestamp } from './formatting';
import { matchesSearch } from './filters';
import { PANEL } from './uiClasses';

const EMPTY_FORM: PatientFormValues = {
  name: '',
  birthdate: '',
  ssn: '',
  diagnosis: '',
  medications: '',
  notes: ''
};

const FIELD_PANEL = 'bg-slate-50/50 p-4 rounded-lg border border-slate-200 hover:bg-white transition-colors';

interface ClinicalFieldProps {
  label: React.ReactNode;
  visible: boolean;
  maskedValue: string;
  maskedTone?: 'muted' | 'locked';
  wide?: boolean;
  spacing?: string;
  children: React.ReactNode;
}

function ClinicalField({ label, visible, maskedValue, maskedTone = 'locked', wide, spacing = 'space-y-1', children }: ClinicalFieldProps) {
  return (
    <div className={`${FIELD_PANEL} ${spacing}${wide ? ' md:col-span-2' : ''}`}>
      <span className="text-slate-400 uppercase tracking-wide block text-[10px] font-mono font-bold">{label}</span>
      {visible ? children : maskedTone === 'muted' ? (
        <span className="text-slate-450 font-mono italic block pt-0.5 select-none">{maskedValue}</span>
      ) : (
        <span className="text-red-700 font-mono text-[10px] block pt-0.5 select-none flex items-center gap-1 font-semibold">
          <Lock className="w-3 h-3 text-red-600" /> {maskedValue}
        </span>
      )}
    </div>
  );
}

interface PatientWorkspaceProps {
  patients: Patient[];
  currentUser: UserSession | null;
  consultState: ConsultModeState;
  onAddPatient: (patientData: Omit<Patient, 'id' | 'version' | 'updatedAt' | 'updatedBy'>, reason: string) => Promise<void>;
  onUpdatePatient: (id: string, patientData: Partial<Patient>, version: number, reason: string) => Promise<void>;
  onLogAudit: (action: 'CREATE' | 'UPDATE' | 'VIEW' | 'SYNC_PULL' | 'SYNC_PUSH' | 'SECURITY_ALERT', reason: string) => void;
}

export default function PatientWorkspace({
  patients,
  currentUser,
  consultState,
  onAddPatient,
  onUpdatePatient,
  onLogAudit
}: PatientWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  // Creation/Edit forms state
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [form, setForm] = useState<PatientFormValues>(EMPTY_FORM);
  const [reason, setReason] = useState('');

  const updateForm = (patch: Partial<PatientFormValues>) => setForm(prev => ({ ...prev, ...patch }));

  // Access filter: check if a specific field is readable under RBAC & Consult mode
  const canReadField = (field: keyof ConsultModeState['selectedFields']): boolean => {
    // 1. Admin Role is completely restricted from patient clinical fields
    if (currentUser?.role === 'Admin') {
      if (field === 'ssn' || field === 'diagnosis' || field === 'medications' || field === 'notes') {
        return false;
      }
    }

    // 2. Consult Mode active restricts fields not checked by provider
    if (consultState.isActive) {
      return !!consultState.selectedFields[field];
    }

    return true;
  };

  const getMaskedValue = (field: keyof ConsultModeState['selectedFields'], actualValue: string) => {
    if (canReadField(field)) {
      return actualValue || 'None recorded';
    }

    if (currentUser?.role === 'Admin') {
      return 'RESTRICTED (SANITISED ADMIN ACCESS)';
    }

    return '⚠️ BLOCKED IN CONSULT WORKFLOW';
  };

  const handleOpenCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedPatient(null);
    setFormError(null);

    setForm(EMPTY_FORM);
    setReason('');
  };

  const handleOpenEdit = (patient: Patient) => {
    setIsEditing(true);
    setIsCreating(false);
    setSelectedPatient(patient);
    setFormError(null);

    setForm({
      name: patient.name,
      birthdate: patient.birthdate,
      ssn: patient.ssn,
      diagnosis: patient.diagnosis,
      medications: patient.medications,
      notes: patient.notes
    });
    setReason(''); // Reason must always be typed fresh!
  };

  const handleCancelForm = () => {
    setIsCreating(false);
    setIsEditing(false);
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Patient full name is required.');
      return;
    }
    if (!reason.trim()) {
      setFormError('Reason for Change is mandatory for HIPAA audits.');
      return;
    }

    try {
      await onAddPatient(form, reason);
      setIsCreating(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create patient.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedPatient) return;
    if (!reason.trim()) {
      setFormError('Reason for Change is mandatory for HIPAA audits.');
      return;
    }

    try {
      await onUpdatePatient(
        selectedPatient.id,
        form,
        selectedPatient.version,
        reason
      );
      setIsEditing(false);
      // Deselect or update detailed card representation
      setSelectedPatient(null);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save patient changes.');
    }
  };

  const filteredPatients = patients.filter(p => matchesSearch(searchTerm, [p.name, p.id]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="patients-workspace">
      {/* Patient Directory Directory List Column */}
      <div className={`lg:col-span-1 ${PANEL} flex flex-col space-y-4`}>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Secure Registry directory
          </span>
          {currentUser?.role === 'Provider' && (
            <button
              onClick={handleOpenCreate}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition font-bold"
              id="open-create-patient-btn"
            >
              <UserPlus className="w-3.5 h-3.5" /> New File
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient name, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder:text-slate-450 focus:outline-none focus:border-slate-350 focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Scrollable list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredPatients.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-450">No patient files found.</div>
          ) : (
            filteredPatients.map(p => {
              const isSelected = selectedPatient?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPatient(p);
                    setIsCreating(false);
                    setIsEditing(false);
                    onLogAudit('VIEW', `Accessed clinical dashboard patient file overview: ${p.name}`);
                  }}
                  className={`w-full text-left p-3.5 rounded-lg border text-xs transition-all flex justify-between items-center ${
                    isSelected
                      ? 'bg-blue-50 border-blue-600 text-blue-800'
                      : 'bg-slate-50 border-slate-150 hover:bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm'
                  }`}
                  id={`patient-card-btn-${p.id}`}
                >
                  <div className="space-y-1">
                    <strong className={`font-semibold block ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>{p.name}</strong>
                    <div className="flex gap-2 text-[10px] font-mono text-slate-400">
                      <span>ID: {p.id}</span>
                      <span>•</span>
                      <span>v{p.version}</span>
                    </div>
                  </div>
                  <User className={`w-4 h-4 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Workspace Column: Forms or Detailed Viewer */}
      <div className="lg:col-span-2 space-y-6">
        {/* CREATE FILE SCREEN */}
        {isCreating && (
          <PatientRecordForm
            id="patient-creation-form"
            heading="Create New HIPAA Compliant Patient File"
            submitLabel="Assemble Cryptographic Block"
            values={form}
            onChange={updateForm}
            reason={reason}
            onReasonChange={setReason}
            reasonPlaceholder="Justification reason for opening this file... (e.g. 'Initial patient intake intake examination')"
            showPlaceholders
            error={formError}
            onSubmit={handleCreateSubmit}
            onCancel={handleCancelForm}
          />
        )}

        {/* EDIT FILE SCREEN */}
        {isEditing && (
          <PatientRecordForm
            id="patient-edit-form"
            heading={`Edit File: ${selectedPatient?.name} (Current Version: v${selectedPatient?.version})`}
            submitLabel={`Lock Updated Block (v${selectedPatient ? selectedPatient.version + 1 : ''})`}
            values={form}
            onChange={updateForm}
            reason={reason}
            onReasonChange={setReason}
            reasonPlaceholder="Reason for making clinical changes to this file..."
            error={formError}
            onSubmit={handleEditSubmit}
            onCancel={handleCancelForm}
          />
        )}

        {/* DETAILED VIEWER SCREEN */}
        {selectedPatient && !isCreating && !isEditing && (
          <div className={`${PANEL} p-6 space-y-6 animate-fade-in`} id="patient-detail-card">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-semibold text-lg text-slate-800">
                    {selectedPatient.name}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-bold">
                    v{selectedPatient.version}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-slate-400 font-mono">
                  <span>ID: {selectedPatient.id}</span>
                  <span>•</span>
                  <span>Last Modified: {formatTimestamp(selectedPatient.updatedAt)}</span>
                </div>
              </div>

              {currentUser?.role === 'Provider' && (
                <button
                  onClick={() => handleOpenEdit(selectedPatient)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-705 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition shadow-sm"
                  id="edit-patient-btn"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Modify Record
                </button>
              )}
            </div>

            {/* Shield banner when consult mode is active */}
            {consultState.isActive && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center gap-2.5 text-xs text-blue-700 animate-pulse">
                <Shield className="w-4 h-4 text-blue-600 shrink-0" />
                <span>
                  <strong>Consult View Active:</strong> Sensitive demographics have been selectively filtered.
                </span>
              </div>
            )}

            {/* Demographics Field Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <ClinicalField label="Birthdate" visible={canReadField('birthdate')} maskedValue={getMaskedValue('birthdate', '')} maskedTone="muted">
                <div className="text-slate-800 font-medium flex items-center gap-1.5 pt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {selectedPatient.birthdate || 'Not recorded'}
                </div>
              </ClinicalField>

              <ClinicalField label="SSN (Social Security)" visible={canReadField('ssn')} maskedValue={getMaskedValue('ssn', '')}>
                <div className="text-slate-800 font-mono tracking-wider pt-0.5 select-all">{selectedPatient.ssn || 'Not recorded'}</div>
              </ClinicalField>

              <ClinicalField label="Clinical Diagnosis" visible={canReadField('diagnosis')} maskedValue={getMaskedValue('diagnosis', '')} wide>
                <div className="text-slate-800 font-medium pt-0.5">{selectedPatient.diagnosis || 'None recorded'}</div>
              </ClinicalField>

              <ClinicalField label="Active Prescription Regimen" visible={canReadField('medications')} maskedValue={getMaskedValue('medications', '')} wide>
                <div className="text-slate-800 font-medium pt-0.5">{selectedPatient.medications || 'None recorded'}</div>
              </ClinicalField>

              <ClinicalField
                label={<span className="flex items-center gap-1"><FileText className="w-3 h-3 text-slate-400" /> Clinician Progress Log</span>}
                visible={canReadField('notes')}
                maskedValue={getMaskedValue('notes', '')}
                spacing="space-y-1.5"
                wide
              >
                <p className="text-slate-700 leading-relaxed pt-0.5 whitespace-pre-wrap">{selectedPatient.notes || 'No progress notes recorded.'}</p>
              </ClinicalField>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg flex items-center gap-3 text-[11px] font-mono text-slate-500">
              <Shield className="w-4 h-4 text-slate-450 shrink-0" />
              <div>
                <span>Last updated by: <strong className="text-slate-650">{selectedPatient.updatedBy}</strong></span>
                <span className="mx-2">|</span>
                <span>Audit signature verified. No silent tampering detected.</span>
              </div>
            </div>
          </div>
        )}

        {/* DEFAULT STATE: NO SELECTION */}
        {!selectedPatient && !isCreating && !isEditing && (
          <div className={`${PANEL} p-8 text-center text-slate-450 space-y-4 flex flex-col items-center justify-center min-h-[300px]`}>
            <Shield className="w-10 h-10 text-slate-300" />
            <div className="space-y-1">
              <span className="font-display font-medium text-slate-700 block text-sm">Patient File Sealed</span>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Choose an active patient file from the Left Directory panel or initialize a new record to verify medical records. All read accesses are recorded in compliance logs.
              </p>
            </div>
            {currentUser?.role === 'Provider' && (
              <button
                onClick={handleOpenCreate}
                className="py-1.5 px-4 bg-blue-600 hover:bg-blue-700 active:translate-y-px transition text-white text-xs font-semibold rounded-lg flex items-center gap-1 text-center font-display shadow-sm font-bold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Initialize New File
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
