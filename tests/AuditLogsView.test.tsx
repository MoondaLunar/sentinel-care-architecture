/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogsView from '../components/AuditLogsView';
import { AuditLog } from '../types';
import { GENESIS_HASH, buildLogChain, computeLogHash } from './fixtures';

function setup(logs: AuditLog[]) {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const onTriggerTamper = vi.fn().mockResolvedValue(undefined);
  const onResetDatabase = vi.fn().mockResolvedValue(undefined);

  render(
    <AuditLogsView
      logs={logs}
      onRefresh={onRefresh}
      onTriggerTamper={onTriggerTamper}
      onResetDatabase={onResetDatabase}
    />
  );

  return { onRefresh, onTriggerTamper, onResetDatabase };
}

const shownBlockCount = () => document.querySelectorAll('[id^="audit-log-block-"]').length;

const defaultChain = () =>
  buildLogChain([
    { action: 'CREATE', reason: 'Created record', patientId: 'pat_1', patientName: 'Amanda Parker' },
    {
      action: 'UPDATE',
      actorId: 'nurse.jones',
      actorRole: 'Nurse',
      reason: 'Adjusted dosage',
      patientId: 'pat_1',
      patientName: 'Amanda Parker',
      beforeState: '{"medications":"Albuterol"}',
      afterState: '{"medications":"Albuterol, Prednisone"}'
    },
    { action: 'VIEW', reason: 'Opened chart' }
  ]);

describe('AuditLogsView hash chain verification', () => {
  it('marks every block of an untampered chain as verified', async () => {
    const logs = await defaultChain();
    setup(logs);

    await waitFor(() => {
      expect(screen.getAllByText('Verified')).toHaveLength(3);
    });
    expect(screen.queryByText('Tamper Detected')).not.toBeInTheDocument();
  });

  it('flags an altered block and cascades the failure to later blocks', async () => {
    const logs = await defaultChain();
    const tampered = logs.map(log =>
      log.id === 'log_2' ? { ...log, reason: 'Silently rewritten reason' } : log
    );
    setup(tampered);

    await waitFor(() => {
      expect(screen.getAllByText('Tamper Detected')).toHaveLength(2);
    });
    expect(screen.getByTitle(/Digital fingerprint mismatch/)).toHaveAttribute(
      'id',
      'local-integrity-badge-log_2'
    );
    expect(screen.getByTitle(/Chain link broken due to prior tamper at block ID: log_2/)).toBeInTheDocument();
    expect(screen.getAllByText('Verified')).toHaveLength(1);
  });

  it('rejects a genesis block whose previous hash link is not zeroed', async () => {
    const [log] = await buildLogChain([{ reason: 'Only event' }]);
    const orphan: AuditLog = { ...log, previousHash: 'f'.repeat(64) };
    orphan.hash = await computeLogHash(orphan);
    setup([orphan]);

    await waitFor(() => {
      expect(screen.getByTitle('Genesis block previous hash link corrupted')).toBeInTheDocument();
    });
  });

  it('detects a broken previous hash linkage even when each block hash is self consistent', async () => {
    const logs = await defaultChain();
    const chronological = [...logs].reverse();
    const relinked: AuditLog = { ...chronological[1], previousHash: GENESIS_HASH };
    relinked.hash = await computeLogHash(relinked);
    const trailing: AuditLog = { ...chronological[2], previousHash: relinked.hash };
    trailing.hash = await computeLogHash(trailing);

    setup([trailing, relinked, chronological[0]]);

    await waitFor(() => {
      expect(screen.getByTitle('Hash linkage broken (Preceding block link mismatch)')).toBeInTheDocument();
    });
  });

  it('treats offline buffered blocks as pending instead of tampered', async () => {
    const logs = await defaultChain();
    const buffered: AuditLog = {
      ...logs[0],
      id: 'mock_log_offline',
      hash: 'PENDING_OFFLINE_SYNC_HASH'
    };
    setup([buffered, ...logs]);

    await waitFor(() => {
      expect(screen.getByText('Offline Pending')).toBeInTheDocument();
    });
    expect(screen.queryByText('Tamper Detected')).not.toBeInTheDocument();
  });
});

describe('AuditLogsView investigation filters', () => {
  it('narrows the ledger by free text across reasons, actors and ids', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);

    await user.type(screen.getByPlaceholderText(/Search reason, patient, ID or hash/), 'dosage');
    expect(shownBlockCount()).toBe(1);

    await user.clear(screen.getByPlaceholderText(/Search reason, patient, ID or hash/));
    await user.type(screen.getByPlaceholderText(/Search reason, patient, ID or hash/), 'log_3');
    expect(screen.getByText('Reason: Opened chart')).toBeInTheDocument();
    expect(screen.queryByText('Reason: Created record')).not.toBeInTheDocument();
  });

  it('combines the action and actor selectors', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);

    await user.selectOptions(document.getElementById('audit-action-select') as HTMLSelectElement, 'UPDATE');
    expect(shownBlockCount()).toBe(1);

    await user.selectOptions(document.getElementById('audit-action-select') as HTMLSelectElement, 'ALL');
    await user.selectOptions(document.getElementById('audit-actor-select') as HTMLSelectElement, 'nurse.jones');
    expect(screen.getByText('Reason: Adjusted dosage')).toBeInTheDocument();
    expect(screen.queryByText('Reason: Opened chart')).not.toBeInTheDocument();
  });

  it('applies the inclusive from and to date boundaries', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);

    await user.type(document.getElementById('audit-start-date') as HTMLInputElement, '2024-05-02');
    await user.type(document.getElementById('audit-end-date') as HTMLInputElement, '2024-05-02');

    expect(shownBlockCount()).toBe(1);
    expect(screen.getByText('Reason: Adjusted dosage')).toBeInTheDocument();
  });

  it('shows the empty state and clears every active filter', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);

    await user.type(screen.getByPlaceholderText(/Search reason, patient, ID or hash/), 'nothing matches');
    expect(screen.getByText(/No ledger blocks match your active search criteria/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear Filters/ }));
    expect(shownBlockCount()).toBe(3);
    expect(screen.queryByRole('button', { name: /Clear Filters/ })).not.toBeInTheDocument();
  });
});

describe('AuditLogsView server side integrity actions', () => {
  it('renders the passing verification summary returned by the server', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          verified: true,
          corruptedLogIndex: null,
          corruptedLogId: null,
          totalLogsChecked: 3
        })
      })
    );

    await user.click(screen.getByRole('button', { name: /Verify Chain Integrity/ }));

    expect(await screen.findByText('Cryptographic Audit Trail Secure')).toBeInTheDocument();
    expect(screen.getByText(/Recalculated cryptographic hashes across all 3/)).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
  });

  it('highlights the corrupted block reported by the server', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          verified: false,
          corruptedLogIndex: 1,
          corruptedLogId: 'log_2',
          totalLogsChecked: 3
        })
      })
    );

    await user.click(screen.getByRole('button', { name: /Verify Chain Integrity/ }));

    expect(await screen.findByText(/SECURITY BREACH DETECTED/)).toBeInTheDocument();
    expect(screen.getByText(/Block ID: log_2/)).toBeInTheDocument();
    expect(screen.getByText('MISMATCH DETECTED')).toBeInTheDocument();
  });

  it('keeps the banner hidden when the verification endpoint fails', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await user.click(screen.getByRole('button', { name: /Verify Chain Integrity/ }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Verify Chain Integrity/ })).toBeEnabled();
    });
    expect(screen.queryByText(/Cryptographic Audit Trail Secure/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SECURITY BREACH DETECTED/)).not.toBeInTheDocument();
  });

  it('announces a successful tamper simulation and reloads the ledger', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    const { onRefresh, onTriggerTamper } = setup(logs);
    onTriggerTamper.mockResolvedValueOnce({ tamperedLogId: 'log_2', tamperedIndex: 1 });

    await user.click(screen.getByRole('button', { name: /Simulate Ledger Tampering/ }));

    expect(await screen.findByText(/Log Block Index #1 was forced-modified in-memory/)).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows an error banner when the tamper simulation is rejected', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    const { onRefresh, onTriggerTamper } = setup(logs);
    onTriggerTamper.mockRejectedValueOnce(new Error('Need at least two logs'));

    await user.click(screen.getByRole('button', { name: /Simulate Ledger Tampering/ }));

    expect(await screen.findByText('Need at least two logs')).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('only re-initialises the ledger once the operator confirms', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    const { onRefresh, onResetDatabase } = setup(logs);
    const confirmSpy = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirmSpy);

    await user.click(screen.getByRole('button', { name: /Re-Initialize System/ }));
    expect(onResetDatabase).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Re-Initialize System/ }));
    await waitFor(() => expect(onResetDatabase).toHaveBeenCalledTimes(1));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('AuditLogsView snapshot viewer and export', () => {
  it('pretty prints the before and after snapshots of the selected block', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);

    await user.click(screen.getAllByText(/DIGITAL FINGERPRINT/)[1]);

    expect(screen.getByText(/BLOCK ID: log_2/)).toBeInTheDocument();
    expect(screen.getByText(/"medications": "Albuterol, Prednisone"/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Close Snapshot Reviewer/ }));
    expect(screen.queryByText(/BLOCK ID: log_2/)).not.toBeInTheDocument();
  });

  it('labels missing snapshots for read only blocks', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);

    await user.click(screen.getAllByText(/DIGITAL FINGERPRINT/)[0]);

    expect(screen.getByText('null (Genesis/Create Action)')).toBeInTheDocument();
    expect(screen.getByText('null (View/Read Action)')).toBeInTheDocument();
  });

  it('exports the whole ledger as a downloadable json anchor', async () => {
    const user = userEvent.setup();
    const logs = await defaultChain();
    setup(logs);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createSpy = vi.spyOn(document, 'createElement');

    await user.click(screen.getByRole('button', { name: /Export Compliance JSON/ }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = createSpy.mock.results
      .map(result => result.value)
      .find((element): element is HTMLAnchorElement => element instanceof HTMLAnchorElement);
    expect(anchor?.getAttribute('download')).toBe('compliance_audit_ledger_export.json');
    expect(decodeURIComponent(anchor?.getAttribute('href') ?? '')).toContain('"id": "log_3"');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
