/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { StrictMode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncEngineManager from '../components/SyncEngineManager';
import { Patient, SyncEvent } from '../types';
import { makePatient, makeSyncEvent, makeUser } from './fixtures';

interface HarnessOptions {
  patients?: Patient[];
  events?: SyncEvent[];
  online?: boolean;
  /** Mounts under StrictMode so effects and state updaters run twice. */
  strict?: boolean;
}

/**
 * The engine owns no state of its own, so the harness supplies the queue,
 * the local cache and the network flag the way the shell application does.
 */
function setup(options: HarnessOptions = {}) {
  const onLogAudit = vi.fn();
  const triggerServerFetch = vi.fn().mockResolvedValue(undefined);
  const queueSpy = vi.fn<(events: SyncEvent[]) => void>();
  const patientSpy = vi.fn<(patients: Patient[]) => void>();

  function Harness() {
    const [patients, setPatients] = useState<Patient[]>(options.patients ?? [makePatient()]);
    const [events, setEvents] = useState<SyncEvent[]>(options.events ?? []);
    const [isOnline, setIsOnline] = useState(options.online ?? true);

    queueSpy(events);
    patientSpy(patients);

    return (
      <SyncEngineManager
        localPatients={patients}
        setLocalPatients={setPatients}
        currentUser={makeUser()}
        onLogAudit={onLogAudit}
        syncEvents={events}
        setSyncEvents={setEvents}
        isOnline={isOnline}
        setIsOnline={setIsOnline}
        triggerServerFetch={triggerServerFetch}
      />
    );
  }

  render(options.strict ? <StrictMode><Harness /></StrictMode> : <Harness />);

  return {
    onLogAudit,
    triggerServerFetch,
    latestQueue: () => queueSpy.mock.calls.at(-1)?.[0] ?? [],
    latestPatients: () => patientSpy.mock.calls.at(-1)?.[0] ?? []
  };
}

const jsonResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/**
 * The engine re-runs its queue effect on every queue identity change, so any
 * request past the scripted ones is left in flight to pin the observed state.
 */
const stubFetch = (...responses: unknown[]) => {
  const fetchMock = vi.fn();
  responses.forEach(body => fetchMock.mockResolvedValueOnce(jsonResponse(body)));
  fetchMock.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const ledger = () => within(document.getElementById('sync-history-ledger-container') as HTMLElement);

const serverPatient = makePatient({
  version: 7,
  diagnosis: 'Severe persistent asthma',
  medications: 'Albuterol, Fluticasone',
  notes: 'Server note.',
  updatedBy: 'dr.chen'
});

const conflictSetup = async () => {
  const fetchMock = stubFetch({
    results: [{ eventId: 'evt_1', status: 'conflict', error: 'Version mismatch', serverPatient }]
  });
  const harness = setup({
    events: [
      makeSyncEvent({
        payload: makePatient({ version: 3, diagnosis: 'Mild asthma', medications: '', notes: 'Local note.' })
      })
    ]
  });

  expect(await screen.findByText('HIPAA Concurrency Conflict Detected')).toBeInTheDocument();
  return { ...harness, fetchMock };
};

describe('SyncEngineManager queue push', () => {
  it('flushes the queue and refreshes the local cache on a successful push', async () => {
    const pushed = makePatient({ version: 4, diagnosis: 'Moderate asthma' });
    const fetchMock = stubFetch({ results: [{ eventId: 'evt_1', status: 'success', patient: pushed }] });
    const { latestQueue, latestPatients, triggerServerFetch } = setup({ events: [makeSyncEvent()] });

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(latestQueue()).toEqual([]);
    expect(latestPatients()).toEqual([pushed]);
    expect(triggerServerFetch).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers['X-User-Role']).toBe('Provider');
    expect(JSON.parse(request.body).events).toHaveLength(1);
  });

  it('appends an unknown patient returned by the server to the local cache', async () => {
    const created = makePatient({ id: 'pat_9', name: 'Nadia Reyes', version: 1 });
    stubFetch({ results: [{ eventId: 'evt_1', status: 'success', patient: created }] });
    const { latestPatients } = setup({
      events: [makeSyncEvent({ patientId: 'pat_9', action: 'CREATE', payload: created })]
    });

    await waitFor(() => expect(latestPatients()).toHaveLength(2));
    expect(latestPatients().map(patient => patient.id)).toEqual(['pat_1', 'pat_9']);
  });

  it('reports a per event server error without dropping it from the ledger', async () => {
    stubFetch({ results: [{ eventId: 'evt_1', status: 'error', error: 'Reason metadata missing' }] });
    const { latestQueue } = setup({ events: [makeSyncEvent()] });

    expect(await ledger().findByText('Reason metadata missing')).toBeInTheDocument();
    expect(latestQueue()).toHaveLength(1);
  });

  it('falls back to exponential backoff when the backend is unreachable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    setup({ events: [makeSyncEvent()] });

    expect(await screen.findByText(/Backend unreachable/)).toBeInTheDocument();
    expect(await screen.findByText('Retrying in 2s')).toBeInTheDocument();
    expect(screen.getByText(/Offline buffer retry attempt #1/)).toBeInTheDocument();
    expect(screen.getByText('Network Connection Unreachable')).toBeInTheDocument();
  });

  it('treats a non ok response as a transport failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    setup({ events: [makeSyncEvent()] });

    expect(await screen.findByText(/Backend unreachable/)).toBeInTheDocument();
  });

  it('never contacts the server while the simulator is offline', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setup({ events: [makeSyncEvent()], online: false });

    expect(screen.getByText('SIMULATOR: OFFLINE')).toBeInTheDocument();
    expect(screen.getByText('Pending Sync')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /SIMULATOR: OFFLINE/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe('SyncEngineManager conflict resolution', () => {
  it('surfaces both sides of a concurrency conflict', async () => {
    await conflictSetup();

    expect(screen.getByText('Mild asthma')).toBeInTheDocument();
    expect(screen.getByText('Severe persistent asthma')).toBeInTheDocument();
    expect(screen.getByText('BASE VERSION: v3')).toBeInTheDocument();
    expect(screen.getByText(/SERVER VERSION: v7 \(Updated by dr.chen\)/)).toBeInTheDocument();
    expect(ledger().getByText('Version mismatch')).toBeInTheDocument();
  });

  it('merges field by field and re-queues the event against the server version', async () => {
    const user = userEvent.setup();
    const { latestQueue, latestPatients, onLogAudit } = await conflictSetup();

    await user.click(screen.getByRole('button', { name: /Merge Changes Field-by-Field/ }));

    await waitFor(() => expect(latestQueue()[0].version).toBe(7));
    const [merged] = latestQueue();
    expect(merged.reason).toBe('[RECONCILED - MERGED] Updated medication list');
    expect(merged.payload.diagnosis).toBe('Mild asthma');
    expect(merged.payload.medications).toBe('Albuterol, Fluticasone');
    expect(merged.payload.notes).toBe('Server note.\n-- Merged Note --\nLocal note.');
    expect(latestPatients()[0].notes).toBe(merged.payload.notes);
    expect(onLogAudit).toHaveBeenCalledWith(
      'SECURITY_ALERT',
      'Sync conflict resolved: Provider manually merged conflicting updates for patient Amanda Parker.'
    );
    expect(screen.queryByText('HIPAA Concurrency Conflict Detected')).not.toBeInTheDocument();
  });

  it('re-sends the local payload with the server version on a forced overwrite', async () => {
    const user = userEvent.setup();
    const { latestQueue } = await conflictSetup();

    await user.click(screen.getByRole('button', { name: /Force Overwrite Server/ }));

    await waitFor(() => expect(latestQueue()[0].version).toBe(7));
    const [resolved] = latestQueue();
    expect(resolved.version).toBe(7);
    expect(resolved.reason).toBe('[RECONCILED - MANUAL OVERWRITE] Updated medication list');
    expect(resolved.payload.diagnosis).toBe('Mild asthma');
  });

  it('discards the local edit when the remote record is accepted', async () => {
    const user = userEvent.setup();
    const { latestQueue, latestPatients, onLogAudit } = await conflictSetup();

    await user.click(screen.getByRole('button', { name: /Accept Server \(Discard Mine\)/ }));

    await waitFor(() => expect(latestQueue()).toEqual([]));
    expect(latestPatients()[0]).toEqual(serverPatient);
    expect(onLogAudit).toHaveBeenCalledWith(
      'SECURITY_ALERT',
      'Sync conflict resolved: Provider accepted remote server state for patient Amanda Parker.'
    );
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('stops processing the rest of the batch until the conflict is resolved', async () => {
    stubFetch({
      results: [
        { eventId: 'evt_1', status: 'conflict', error: 'Version mismatch', serverPatient },
        { eventId: 'evt_2', status: 'success', patient: makePatient({ id: 'pat_2' }) }
      ]
    });
    const { latestQueue, triggerServerFetch } = setup({
      events: [makeSyncEvent(), makeSyncEvent({ id: 'evt_2', patientId: 'pat_2' })]
    });

    expect(await screen.findByText('HIPAA Concurrency Conflict Detected')).toBeInTheDocument();
    expect(latestQueue()).toHaveLength(2);
    expect(triggerServerFetch).not.toHaveBeenCalled();
  });
});

describe('SyncEngineManager retry scheduling', () => {
  const rejectedResult = { results: [{ eventId: 'evt_1', status: 'error', error: 'Rejected' }] };

  it('schedules a rejected event through the backoff instead of re-pushing it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rejectedResult));
    vi.stubGlobal('fetch', fetchMock);
    setup({ events: [makeSyncEvent()] });

    expect(await screen.findByText('Retrying in 2s')).toBeInTheDocument();
    expect(screen.getByText(/Offline buffer retry attempt #1/)).toBeInTheDocument();
    // The queue is durable, so the event stays; what must not happen is a
    // second push before the scheduled delay has elapsed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('escalates the delay on consecutive failures without resetting it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(rejectedResult));
    vi.stubGlobal('fetch', fetchMock);
    setup({ events: [makeSyncEvent()] });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(await screen.findByText('Retrying in 4s')).toBeInTheDocument();
    expect(screen.getByText(/Offline buffer retry attempt #2/)).toBeInTheDocument();
  });

  it('keeps a single push in flight when the effects are double invoked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 20));
      inFlight -= 1;
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);
    setup({ events: [makeSyncEvent()], strict: true });

    expect(await screen.findByText('Retrying in 2s')).toBeInTheDocument();
    expect(maxInFlight).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('SyncEngineManager ledger metrics', () => {
  it('tracks progress across mixed outcomes', async () => {
    stubFetch({
      results: [
        { eventId: 'evt_1', status: 'success', patient: makePatient() },
        { eventId: 'evt_2', status: 'error', error: 'Rejected' }
      ]
    });
    setup({ events: [makeSyncEvent(), makeSyncEvent({ id: 'evt_2' })] });

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(ledger().getByText('Rejected')).toBeInTheDocument();
    // Errors count as settled operations, so the tracker reads 2 of 2.
    await waitFor(() =>
      expect(document.getElementById('sync-progress-tracker')?.textContent).toContain(
        '2 / 2 Operations Synced (100%)'
      )
    );
  });

  it('discards the queue and the ledger on demand', async () => {
    const user = userEvent.setup();
    stubFetch({ results: [{ eventId: 'evt_1', status: 'error', error: 'Rejected' }] });
    const { latestQueue } = setup({ events: [makeSyncEvent()] });

    await waitFor(() => expect(ledger().getByText('Rejected')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Discard queue & history/ }));

    expect(latestQueue()).toEqual([]);
    expect(document.getElementById('sync-history-ledger-container')).toBeNull();
    expect(screen.queryByText(/Sync event failed/)).not.toBeInTheDocument();
  });

  it('labels a queued event without a patient name as anonymous', () => {
    vi.stubGlobal('fetch', vi.fn());
    setup({
      events: [makeSyncEvent({ payload: makePatient({ name: '' }) })],
      online: false
    });

    expect(screen.getByText('Anonymous Patient')).toBeInTheDocument();
  });
});
