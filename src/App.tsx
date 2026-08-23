import React, { useMemo, useState } from 'react';
import PatientWorkspace from '../components/PatientWorkspace';
import ConsultModeManager from '../components/ConsultModeManager';
import CameraSafetySystem from '../components/CameraSafetySystem';
import GDPRManager from '../components/GDPRManager';
import AuditLogsView from '../components/AuditLogsView';
import SyncEngineManager from '../components/SyncEngineManager';
import { CameraAttentionState, ConsultModeState, Patient, SyncEvent, UserSession } from '../types';
import { makeConsultState, makePatient, makeUser } from '../tests/fixtures';

const starterPatients: Patient[] = [
  makePatient({
    id: 'pat_001',
    name: 'Amanda Parker',
    birthdate: '1984-02-11',
    ssn: '000-00-0000',
    diagnosis: 'Chronic asthma',
    medications: 'Albuterol',
    notes: 'Stable on current regimen.'
  }),
  makePatient({
    id: 'pat_002',
    name: 'Brian Osei',
    birthdate: '1979-09-18',
    ssn: '111-22-3333',
    diagnosis: 'Type 2 diabetes',
    medications: 'Metformin',
    notes: 'Follow-up review scheduled.'
  }),
  makePatient({
    id: 'pat_003',
    name: 'Nadia Reyes',
    birthdate: '1991-12-02',
    ssn: '444-55-6666',
    diagnosis: 'Post-op recovery',
    medications: 'Ibuprofen',
    notes: 'Mobility therapy notes.'
  })
];

const initialLogs = [
  {
    id: 'log_1',
    timestamp: '2024-05-01T10:00:00.000Z',
    actorId: 'dr.smith',
    actorRole: 'Provider',
    action: 'CREATE',
    patientId: 'pat_001',
    patientName: 'Amanda Parker',
    reason: 'Created record',
    hash: '0'.repeat(64),
    previousHash: '0'.repeat(64)
  },
  {
    id: 'log_2',
    timestamp: '2024-05-02T10:00:00.000Z',
    actorId: 'nurse.jones',
    actorRole: 'Nurse',
    action: 'UPDATE',
    patientId: 'pat_001',
    patientName: 'Amanda Parker',
    beforeState: '{"medications":"Albuterol"}',
    afterState: '{"medications":"Albuterol, Prednisone"}',
    reason: 'Adjusted dosage',
    hash: '1'.repeat(64),
    previousHash: '0'.repeat(64)
  },
  {
    id: 'log_3',
    timestamp: '2024-05-03T10:00:00.000Z',
    actorId: 'dr.smith',
    actorRole: 'Provider',
    action: 'VIEW',
    patientId: 'pat_001',
    patientName: 'Amanda Parker',
    reason: 'Opened chart',
    hash: '2'.repeat(64),
    previousHash: '1'.repeat(64)
  }
] as any;

export default function App() {
  const [currentUser] = useState<UserSession>(makeUser({ role: 'Provider', userName: 'Dr. Smith' }));
  const [patients, setPatients] = useState<Patient[]>(starterPatients);
  const [consultState, setConsultState] = useState<ConsultModeState>(makeConsultState());
  const [cameraState, setCameraState] = useState<CameraAttentionState>(CameraAttentionState.SAFE_FOCUS);
  const [logs, setLogs] = useState<any[]>(initialLogs);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [online, setOnline] = useState(true);

  const auditLogAction = async (action: any, reason: string) => {
    const newEntry = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: currentUser.userId,
      actorRole: currentUser.role,
      action,
      patientId: patients[0]?.id,
      patientName: patients[0]?.name,
      reason,
      hash: '0'.repeat(64),
      previousHash: logs[logs.length - 1]?.hash ?? '0'.repeat(64)
    };
    setLogs(prev => [newEntry, ...prev]);
  };

  const handleAddPatient = async (patientData: Omit<Patient, 'id' | 'version' | 'updatedAt' | 'updatedBy'>, reason: string) => {
    const patient: Patient = {
      id: `pat_${Date.now()}`,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.userName,
      ...patientData
    };
    setPatients(prev => [patient, ...prev]);
    setEvents(prev => [
      ...prev,
      {
        id: `evt_${Date.now()}`,
        patientId: patient.id,
        action: 'CREATE',
        payload: patient,
        version: 1,
        timestamp: new Date().toISOString(),
        reason
      }
    ]);
    await auditLogAction('CREATE', reason);
  };

  const handleUpdatePatient = async (id: string, patientData: Partial<Patient>, version: number, reason: string) => {
    const updated: Patient = {
      ...patients.find(p => p.id === id)!,
      ...patientData,
      version: version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.userName
    };
    setPatients(prev => prev.map(p => (p.id === id ? updated : p)));
    setEvents(prev => [
      ...prev,
      {
        id: `evt_${Date.now()}`,
        patientId: id,
        action: 'UPDATE',
        payload: updated,
        version: version + 1,
        timestamp: new Date().toISOString(),
        reason
      }
    ]);
    await auditLogAction('UPDATE', reason);
  };

  const handleTriggerTamper = async () => {
    setLogs(prev => {
      if (prev.length < 2) throw new Error('Need at least two logs');
      const next = [...prev];
      next[1] = { ...next[1], reason: 'Silently rewritten reason' };
      return next;
    });
    return { tamperedLogId: 'log_2', tamperedIndex: 1 };
  };

  const handleResetDatabase = async () => {
    setLogs(initialLogs);
  };

  const handleStateChange = (state: CameraAttentionState) => setCameraState(state);
  const onLogSecurityBypass = (reason: string) => auditLogAction('SECURITY_ALERT', reason);

  const dashboardSummary = useMemo(() => {
    const patientCount = patients.length;
    const activeAlerts = cameraState === CameraAttentionState.NO_FACE || cameraState === CameraAttentionState.MULTI_PERSON ? 1 : 0;
    return { patientCount, activeAlerts };
  }, [patients.length, cameraState]);

  const metrics = [
    { label: 'Active patient files', value: `${dashboardSummary.patientCount}`, accent: 'emerald' },
    { label: 'Privacy alerts', value: `${dashboardSummary.activeAlerts}`, accent: 'amber' },
    { label: 'Compliance checks', value: '99.96%', accent: 'blue' },
    { label: 'Sync status', value: online ? 'Online' : 'Offline', accent: online ? 'emerald' : 'rose' }
  ];

  return (
    <div className="sentinel-shell min-h-screen text-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="sentinel-hero mb-6 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_18px_60px_-24px_rgba(15,23,42,0.35)] backdrop-blur-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.28em] text-blue-700">Sentinel Care</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Clinical privacy demo</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                End-to-end workflows for patient identity protection, consent controls, camera safety, and ledger integrity.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">{dashboardSummary.patientCount} active files</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-700">{dashboardSummary.activeAlerts} alert</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, accent }) => (
              <div key={label} className="metric-card rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <span className={`text-2xl font-semibold ${accent === 'emerald' ? 'text-emerald-600' : accent === 'amber' ? 'text-amber-600' : accent === 'rose' ? 'text-rose-600' : 'text-blue-600'}`}>
                    {value}
                  </span>
                  <span className={`inline-flex h-2.5 w-2.5 rounded-full ${accent === 'emerald' ? 'bg-emerald-500' : accent === 'amber' ? 'bg-amber-500' : accent === 'rose' ? 'bg-rose-500' : 'bg-blue-500'}`} />
                </div>
              </div>
            ))}
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-6">
            <PatientWorkspace
              patients={patients}
              currentUser={currentUser}
              consultState={consultState}
              onAddPatient={handleAddPatient}
              onUpdatePatient={handleUpdatePatient}
              onLogAudit={auditLogAction}
            />
            <GDPRManager
              currentUser={currentUser}
              patients={patients}
              onLogAudit={auditLogAction}
              triggerRefreshPatients={async () => {}} 
            />
          </div>

          <div className="space-y-6">
            <ConsultModeManager
              consultState={consultState}
              onChange={setConsultState}
              onLogAudit={auditLogAction}
            />
            <CameraSafetySystem
              onStateChange={handleStateChange}
              currentUser={currentUser}
              onLogSecurityBypass={onLogSecurityBypass}
              onTriggerInactivityTimeout={() => setCameraState(CameraAttentionState.NO_FACE)}
              idleSecondsLeft={42}
            />
            <SyncEngineManager
              localPatients={patients}
              setLocalPatients={setPatients}
              currentUser={currentUser}
              onLogAudit={auditLogAction}
              syncEvents={events}
              setSyncEvents={setEvents}
              isOnline={online}
              setIsOnline={setOnline}
              triggerServerFetch={async () => {}}
            />
          </div>
        </div>

        <div className="mt-6">
          <AuditLogsView
            logs={logs}
            onRefresh={async () => {}}
            onTriggerTamper={handleTriggerTamper}
            onResetDatabase={handleResetDatabase}
          />
        </div>
      </div>
    </div>
  );
}
