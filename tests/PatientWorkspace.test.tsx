/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientWorkspace from '../components/PatientWorkspace';
import { ConsultModeState, Patient, UserSession } from '../types';
import { makeConsultState, makePatient, makeUser } from './fixtures';

function setup(options: {
  patients?: Patient[];
  currentUser?: UserSession | null;
  consultState?: ConsultModeState;
} = {}) {
  const onAddPatient = vi.fn().mockResolvedValue(undefined);
  const onUpdatePatient = vi.fn().mockResolvedValue(undefined);
  const onLogAudit = vi.fn();

  render(
    <PatientWorkspace
      patients={options.patients ?? [makePatient()]}
      currentUser={options.currentUser === undefined ? makeUser() : options.currentUser}
      consultState={options.consultState ?? makeConsultState()}
      onAddPatient={onAddPatient}
      onUpdatePatient={onUpdatePatient}
      onLogAudit={onLogAudit}
    />
  );

  return { onAddPatient, onUpdatePatient, onLogAudit };
}

const selectPatient = (user: ReturnType<typeof userEvent.setup>, name = 'Amanda Parker') =>
  user.click(screen.getByRole('button', { name: new RegExp(name) }));

const openCreateForm = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /^New File$/ }));

/**
 * The forms mark inputs as `required`, so jsdom's constraint validation would
 * swallow the submit before the component's own HIPAA checks can run.
 */
const submitForm = (formId: string) => fireEvent.submit(document.getElementById(formId)!);

describe('PatientWorkspace directory', () => {
  it('filters the directory by name and by record id', async () => {
    const user = userEvent.setup();
    setup({
      patients: [
        makePatient({ id: 'pat_1', name: 'Amanda Parker' }),
        makePatient({ id: 'pat_2', name: 'Brian Osei' })
      ]
    });
    const search = screen.getByPlaceholderText(/Search patient name/i);

    await user.type(search, 'brian');
    expect(screen.queryByText('Amanda Parker')).not.toBeInTheDocument();
    expect(screen.getByText('Brian Osei')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'pat_1');
    expect(screen.getByText('Amanda Parker')).toBeInTheDocument();
    expect(screen.queryByText('Brian Osei')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'nobody');
    expect(screen.getByText(/No patient files found/i)).toBeInTheDocument();
  });

  it('records a VIEW audit entry whenever a file is opened', async () => {
    const user = userEvent.setup();
    const { onLogAudit } = setup();

    await selectPatient(user);

    expect(onLogAudit.mock.calls.at(-1)).toEqual([
      'VIEW',
      'Accessed clinical dashboard patient file overview: Amanda Parker'
    ]);
  });

  it('hides record creation and editing from non-provider roles', async () => {
    const user = userEvent.setup();
    setup({ currentUser: makeUser({ role: 'Admin' }) });

    expect(screen.queryByRole('button', { name: /New File/ })).not.toBeInTheDocument();
    await selectPatient(user);
    expect(screen.queryByRole('button', { name: /Modify Record/i })).not.toBeInTheDocument();
  });
});

describe('PatientWorkspace field level access control', () => {
  it('sanitises clinical fields for the Admin role while leaving demographics readable', async () => {
    const user = userEvent.setup();
    setup({ currentUser: makeUser({ role: 'Admin' }) });

    await selectPatient(user);

    expect(screen.getByText('1984-02-11')).toBeInTheDocument();
    expect(screen.getAllByText(/RESTRICTED \(SANITISED ADMIN ACCESS\)/)).toHaveLength(4);
    expect(screen.queryByText('000-00-0000')).not.toBeInTheDocument();
    expect(screen.queryByText('Chronic asthma')).not.toBeInTheDocument();
  });

  it('blocks fields that the provider excluded from the consult viewport', async () => {
    const user = userEvent.setup();
    setup({
      consultState: makeConsultState({
        isActive: true,
        timeLeft: 300,
        selectedFields: { ssn: false, notes: false }
      })
    });

    await selectPatient(user);

    expect(screen.getByText(/Consult View Active/i)).toBeInTheDocument();
    expect(screen.getAllByText(/BLOCKED IN CONSULT WORKFLOW/)).toHaveLength(2);
    expect(screen.getByText('Chronic asthma')).toBeInTheDocument();
    expect(screen.queryByText('000-00-0000')).not.toBeInTheDocument();
  });

  it('prefers the admin restriction message when consult mode is also active', async () => {
    const user = userEvent.setup();
    setup({
      currentUser: makeUser({ role: 'Admin' }),
      consultState: makeConsultState({ isActive: true, timeLeft: 300, selectedFields: { ssn: false } })
    });

    await selectPatient(user);

    expect(screen.getAllByText(/RESTRICTED \(SANITISED ADMIN ACCESS\)/)).toHaveLength(4);
    expect(screen.queryByText(/BLOCKED IN CONSULT WORKFLOW/)).not.toBeInTheDocument();
  });

  it('falls back to placeholders for empty clinical values', async () => {
    const user = userEvent.setup();
    setup({ patients: [makePatient({ diagnosis: '', medications: '', notes: '', ssn: '', birthdate: '' })] });

    await selectPatient(user);

    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
    expect(screen.getAllByText('None recorded')).toHaveLength(2);
    expect(screen.getByText('No progress notes recorded.')).toBeInTheDocument();
  });
});

describe('PatientWorkspace create and edit flows', () => {
  it('requires a name and a HIPAA justification before creating a file', async () => {
    const user = userEvent.setup();
    const { onAddPatient } = setup();

    await openCreateForm(user);

    submitForm('patient-creation-form');
    expect(await screen.findByText('Patient full name is required.')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Amanda Parker/), 'Nadia Reyes');
    submitForm('patient-creation-form');
    expect(await screen.findByText('Reason for Change is mandatory for HIPAA audits.')).toBeInTheDocument();
    expect(onAddPatient).not.toHaveBeenCalled();
  });

  it('submits the new record with its justification and closes the form', async () => {
    const user = userEvent.setup();
    const { onAddPatient } = setup();

    await openCreateForm(user);
    await user.type(screen.getByPlaceholderText(/Amanda Parker/), 'Nadia Reyes');
    await user.type(screen.getByPlaceholderText(/000-00-0000/), '111-22-3333');
    await user.type(screen.getByPlaceholderText(/Chronic Asthma exacerbation/), 'Migraine');
    await user.type(screen.getByPlaceholderText(/Justification reason/), 'Initial intake');
    await user.click(screen.getByRole('button', { name: /Assemble Cryptographic Block/i }));

    expect(onAddPatient).toHaveBeenCalledWith(
      {
        name: 'Nadia Reyes',
        birthdate: '',
        ssn: '111-22-3333',
        diagnosis: 'Migraine',
        medications: '',
        notes: ''
      },
      'Initial intake'
    );
    expect(screen.queryByRole('button', { name: /Assemble Cryptographic Block/i })).not.toBeInTheDocument();
  });

  it('surfaces backend failures without discarding the form', async () => {
    const user = userEvent.setup();
    const { onAddPatient } = setup();
    onAddPatient.mockRejectedValueOnce(new Error('Optimistic lock rejected'));

    await openCreateForm(user);
    await user.type(screen.getByPlaceholderText(/Amanda Parker/), 'Nadia Reyes');
    await user.type(screen.getByPlaceholderText(/Justification reason/), 'Initial intake');
    await user.click(screen.getByRole('button', { name: /Assemble Cryptographic Block/i }));

    expect(await screen.findByText('Optimistic lock rejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assemble Cryptographic Block/i })).toBeInTheDocument();
  });

  it('sends the loaded record version for optimistic locking and clears the stale reason', async () => {
    const user = userEvent.setup();
    const { onUpdatePatient } = setup();

    await selectPatient(user);
    await user.click(screen.getByRole('button', { name: /Modify Record/i }));

    expect(screen.getByText(/Current Version: v3/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Reason for making clinical changes/)).toHaveValue('');

    submitForm('patient-edit-form');
    expect(await screen.findByText('Reason for Change is mandatory for HIPAA audits.')).toBeInTheDocument();
    expect(onUpdatePatient).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/Reason for making clinical changes/), 'Added new dosage');
    await user.click(screen.getByRole('button', { name: /Lock Updated Block/i }));

    expect(onUpdatePatient).toHaveBeenCalledWith(
      'pat_1',
      expect.objectContaining({ name: 'Amanda Parker', diagnosis: 'Chronic asthma' }),
      3,
      'Added new dosage'
    );
  });

  it('cancels an in-progress edit without saving', async () => {
    const user = userEvent.setup();
    const { onUpdatePatient } = setup();

    await selectPatient(user);
    await user.click(screen.getByRole('button', { name: /Modify Record/i }));
    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(onUpdatePatient).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Modify Record/i })).toBeInTheDocument();
  });
});
