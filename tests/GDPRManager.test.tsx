/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GDPRManager from '../components/GDPRManager';
import { GDPRDeletionRequest, Patient, UserRole } from '../types';
import { makeGdprRequest, makePatient, makeUser } from './fixtures';

interface RouteResponses {
  list?: GDPRDeletionRequest[];
  listStatus?: number;
  post?: { ok: boolean; body: unknown };
  verify?: { ok: boolean; body: unknown };
  status?: { ok: boolean; body: unknown };
}

function stubRoutes(routes: RouteResponses) {
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    if (url.startsWith('/api/gdpr-requests/verify/')) {
      const verify = routes.verify ?? { ok: false, body: {} };
      return { ok: verify.ok, json: async () => verify.body };
    }
    if (url.includes('/status')) {
      const status = routes.status ?? { ok: true, body: {} };
      return { ok: status.ok, json: async () => status.body };
    }
    if (init?.method === 'POST') {
      const post = routes.post ?? { ok: true, body: makeGdprRequest() };
      return { ok: post.ok, json: async () => post.body };
    }
    const ok = (routes.listStatus ?? 200) < 400;
    return { ok, json: async () => [...(routes.list ?? [])] };
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setup(options: { patients?: Patient[]; role?: UserRole } = {}) {
  const onLogAudit = vi.fn();
  const triggerRefreshPatients = vi.fn().mockResolvedValue(undefined);

  render(
    <GDPRManager
      currentUser={makeUser({ role: options.role ?? 'Provider' })}
      patients={options.patients ?? [makePatient()]}
      onLogAudit={onLogAudit}
      triggerRefreshPatients={triggerRefreshPatients}
    />
  );

  return { onLogAudit, triggerRefreshPatients };
}

const openClinicianView = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Compliance Officer View' }));

describe('GDPRManager erasure submission', () => {
  it('posts the claim, shows the verification code and resets the form', async () => {
    const user = userEvent.setup();
    const created = makeGdprRequest({ verificationToken: 'gdpr_verify_zzz999' });
    const fetchMock = stubRoutes({ post: { ok: true, body: created } });
    const { onLogAudit } = setup();

    await user.selectOptions(screen.getByRole('combobox'), 'pat_1');
    await user.type(screen.getByPlaceholderText('patient@example.com'), 'amanda@example.com');
    await user.type(screen.getByPlaceholderText(/State the reason under GDPR Article 17/), 'Consent revoked');
    await user.click(screen.getByRole('button', { name: /Register GDPR Deletion Claim/ }));

    expect(await screen.findByText('gdpr_verify_zzz999')).toBeInTheDocument();
    const submission = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(submission?.[1]?.body ?? '{}')).toEqual({
      patientId: 'pat_1',
      patientName: 'Amanda Parker',
      requesterEmail: 'amanda@example.com',
      reason: 'Consent revoked'
    });
    expect(onLogAudit).toHaveBeenCalledWith(
      'SECURITY_ALERT',
      'Submitted GDPR Article 17 Erasure request for patient Amanda Parker (ID: pat_1)'
    );
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByPlaceholderText('patient@example.com')).toHaveValue('');
  });

  it('refuses a submission that does not target a known patient file', async () => {
    stubRoutes({});
    setup();

    fireEvent.submit(screen.getByRole('button', { name: /Register GDPR Deletion Claim/ }).closest('form')!);

    expect(await screen.findByText('Please select a valid patient file.')).toBeInTheDocument();
  });

  it('surfaces the compliance server rejection message', async () => {
    const user = userEvent.setup();
    stubRoutes({ post: { ok: false, body: { error: 'Duplicate erasure request already pending' } } });
    const { onLogAudit } = setup();

    await user.selectOptions(screen.getByRole('combobox'), 'pat_1');
    await user.type(screen.getByPlaceholderText('patient@example.com'), 'amanda@example.com');
    await user.type(screen.getByPlaceholderText(/State the reason under GDPR Article 17/), 'Consent revoked');
    await user.click(screen.getByRole('button', { name: /Register GDPR Deletion Claim/ }));

    expect(await screen.findByText('Duplicate erasure request already pending')).toBeInTheDocument();
    expect(onLogAudit).not.toHaveBeenCalled();
  });

  it('copies the verification code to the clipboard', async () => {
    const user = userEvent.setup();
    stubRoutes({ post: { ok: true, body: makeGdprRequest({ verificationToken: 'gdpr_verify_copy' }) } });
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();

    await user.selectOptions(screen.getByRole('combobox'), 'pat_1');
    await user.type(screen.getByPlaceholderText('patient@example.com'), 'amanda@example.com');
    await user.type(screen.getByPlaceholderText(/State the reason under GDPR Article 17/), 'Consent revoked');
    await user.click(screen.getByRole('button', { name: /Register GDPR Deletion Claim/ }));

    await user.click(await screen.findByTitle('Copy code'));

    expect(writeText).toHaveBeenCalledWith('gdpr_verify_copy');
  });
});

describe('GDPRManager receipt verification', () => {
  const verify = async (token = 'gdpr_verify_abc123') => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Enter Verification Code/), token);
    await user.click(screen.getByRole('button', { name: 'Verify' }));
  };

  it('renders the erasure receipt and the referenced ledger block', async () => {
    stubRoutes({
      verify: {
        ok: true,
        body: {
          request: makeGdprRequest({
            status: 'COMPLETED',
            completedAt: '2024-05-04T09:00:00.000Z',
            auditLogId: 'log_88',
            statusLog: [
              {
                status: 'COMPLETED',
                timestamp: '2024-05-04T09:00:00.000Z',
                performedBy: 'dr.smith',
                comment: 'File erased after retention review.'
              }
            ]
          }),
          auditLog: {
            id: 'log_88',
            timestamp: '2024-05-04T09:00:00.000Z',
            actorId: 'dr.smith',
            actorRole: 'Provider',
            action: 'SECURITY_ALERT',
            reason: 'GDPR erasure executed',
            hash: 'a'.repeat(64),
            previousHash: 'b'.repeat(64)
          }
        }
      }
    });
    setup();

    await verify();

    expect(await screen.findByText('COMPLETED (Erased)')).toBeInTheDocument();
    expect(screen.getByText('OFFICIAL ERASURE VERIFICATION RECEIPT')).toBeInTheDocument();
    expect(screen.getByText('log_88')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText('File erased after retention review.')).toBeInTheDocument();
  });

  it('explains a retention hold using the latest officer comment', async () => {
    stubRoutes({
      verify: {
        ok: true,
        body: {
          request: makeGdprRequest({
            status: 'REJECTED_RETAINED',
            statusLog: [
              {
                status: 'PENDING',
                timestamp: '2024-05-01T10:00:00.000Z',
                performedBy: 'amanda@example.com',
                comment: 'Request submitted by patient.'
              },
              {
                status: 'REJECTED_RETAINED',
                timestamp: '2024-05-03T10:00:00.000Z',
                performedBy: 'dr.smith',
                comment: 'HIPAA 6-year preservation rule applies.'
              }
            ]
          }),
          auditLog: null
        }
      }
    });
    setup();

    await verify();

    expect(await screen.findByText('LEGAL HOLD & RETENTION LOCK ENFORCED')).toBeInTheDocument();
    expect(screen.getByText('"HIPAA 6-year preservation rule applies."')).toBeInTheDocument();
    expect(screen.getByText('Rejected / Held')).toBeInTheDocument();
  });

  it('reports an unknown verification code', async () => {
    stubRoutes({ verify: { ok: false, body: { error: 'Unknown verification code' } } });
    setup();

    await verify('gdpr_verify_missing');

    expect(await screen.findByText('Unknown verification code')).toBeInTheDocument();
  });

  it('reports a compliance server outage during verification', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    setup();

    await user.type(screen.getByPlaceholderText(/Enter Verification Code/), 'gdpr_verify_abc123');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Error connecting to the compliance server.')).toBeInTheDocument();
  });

  it('ignores a blank verification submission', async () => {
    const fetchMock = stubRoutes({});
    setup();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.submit(screen.getByRole('button', { name: 'Verify' }).closest('form')!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed verification codes without issuing a request', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes({});
    setup();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.type(screen.getByPlaceholderText(/Enter Verification Code/), '../invalid');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Invalid verification code format.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('URL-encodes a valid verification code in the request path', async () => {
    const user = userEvent.setup();
    const token = 'gdpr_verify_abc123';
    const fetchMock = stubRoutes({
      verify: { ok: false, body: { error: 'Unknown verification code' } }
    });
    setup();

    await user.type(screen.getByPlaceholderText(/Enter Verification Code/), token);
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await screen.findByText('Unknown verification code');
    const verifyCall = fetchMock.mock.calls.find(([url]) => url.includes('/verify/'));
    expect(verifyCall?.[0]).toBe(`/api/gdpr-requests/verify/${encodeURIComponent(token)}`);
  });
});

describe('GDPRManager compliance officer queue', () => {
  it('lists the server queue newest first', async () => {
    const user = userEvent.setup();
    stubRoutes({
      list: [
        makeGdprRequest({ id: 'gdpr_1', patientName: 'Amanda Parker' }),
        makeGdprRequest({ id: 'gdpr_2', patientName: 'Brian Osei' })
      ]
    });
    setup();

    await openClinicianView(user);

    const names = await screen.findAllByText(/Amanda Parker|Brian Osei/);
    expect(names[0]).toHaveTextContent('Brian Osei');
    expect(screen.getAllByText('Pending Identity verification')).toHaveLength(2);
  });

  it('shows the empty and failure states of the queue loader', async () => {
    const user = userEvent.setup();
    stubRoutes({ list: [] });
    setup();

    await openClinicianView(user);
    expect(
      await screen.findByText('No active GDPR requests logged on this compliance server.')
    ).toBeInTheDocument();
  });

  it('reports a failed queue load', async () => {
    stubRoutes({ list: [], listStatus: 500 });
    setup();

    expect(await screen.findByText('Failed to load GDPR requests from server.')).toBeInTheDocument();
  });

  it('verifies an identity without requiring a comment', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes({ list: [makeGdprRequest()], status: { ok: true, body: {} } });
    const { onLogAudit, triggerRefreshPatients } = setup();

    await openClinicianView(user);
    await user.click(await screen.findByRole('button', { name: /Verify Requester Identity/ }));

    await waitFor(() => expect(triggerRefreshPatients).toHaveBeenCalledTimes(1));
    const statusCall = fetchMock.mock.calls.find(([url]) => url.includes('/status'));
    expect(statusCall?.[0]).toBe('/api/gdpr-requests/gdpr_1/status');
    expect(JSON.parse(statusCall?.[1]?.body ?? '{}')).toEqual({ status: 'VERIFIED', comment: '' });
    expect(onLogAudit).toHaveBeenCalledWith(
      'SECURITY_ALERT',
      'GDPR deletion request status updated to VERIFIED for Request ID gdpr_1'
    );
  });

  it('blocks an erasure execution that carries no justification', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes({ list: [makeGdprRequest({ status: 'VERIFIED' })] });
    setup();

    await openClinicianView(user);
    await user.click(await screen.findByRole('button', { name: /Execute Erasure/ }));

    expect(
      await screen.findByText(/A justification or validation comment is strictly required/)
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/status'))).toBe(false);
  });

  it('executes an erasure once a justification is supplied', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRoutes({
      list: [makeGdprRequest({ status: 'VERIFIED' })],
      status: { ok: true, body: {} }
    });
    const { triggerRefreshPatients } = setup();

    await openClinicianView(user);
    await user.type(
      await screen.findByPlaceholderText(/Enter justification comment/),
      'ID card verified, no retention duty'
    );
    await user.click(screen.getByRole('button', { name: /Execute Erasure/ }));

    await waitFor(() => expect(triggerRefreshPatients).toHaveBeenCalledTimes(1));
    const statusCall = fetchMock.mock.calls.find(([url]) => url.includes('/status'));
    expect(JSON.parse(statusCall?.[1]?.body ?? '{}')).toEqual({
      status: 'COMPLETED',
      comment: 'ID card verified, no retention duty'
    });
  });

  it('propagates a rejected status transition', async () => {
    const user = userEvent.setup();
    stubRoutes({
      list: [makeGdprRequest()],
      status: { ok: false, body: { error: 'Only the privacy officer may enforce holds' } }
    });
    setup();

    await openClinicianView(user);
    await user.type(
      await screen.findByPlaceholderText(/Enter justification comment/),
      'Retention rule applies'
    );
    await user.click(screen.getByRole('button', { name: /Reject & Enforce HIPAA Legal Hold/ }));

    expect(await screen.findByText(/Only the privacy officer may enforce holds/)).toBeInTheDocument();
  });

  it('hides the decision panel for settled requests and shows the ledger reference', async () => {
    const user = userEvent.setup();
    stubRoutes({
      list: [makeGdprRequest({ status: 'COMPLETED', auditLogId: 'log_77' })]
    });
    setup();

    await openClinicianView(user);

    expect(await screen.findByText('Completed (Erased)')).toBeInTheDocument();
    expect(screen.getByText('log_77')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter justification comment/)).not.toBeInTheDocument();
  });
});
