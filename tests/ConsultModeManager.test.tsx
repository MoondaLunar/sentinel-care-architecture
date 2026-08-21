/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConsultModeManager from '../components/ConsultModeManager';
import { ConsultModeState } from '../types';
import { makeConsultState } from './fixtures';

function setup(consultState: ConsultModeState = makeConsultState()) {
  const onChange = vi.fn();
  const onLogAudit = vi.fn();
  const view = render(
    <ConsultModeManager consultState={consultState} onChange={onChange} onLogAudit={onLogAudit} />
  );
  return { onChange, onLogAudit, view };
}

describe('ConsultModeManager', () => {
  it('requires the clinical PIN before activating consult mode', async () => {
    const user = userEvent.setup();
    const { onChange, onLogAudit } = setup();

    await user.click(screen.getByRole('button', { name: /Badge Re-Authenticate/i }));
    await user.type(screen.getByPlaceholderText('••••'), '9999');
    await user.click(screen.getByRole('button', { name: /Confirm Biometric/i }));

    expect(screen.getByText(/Invalid Clinical Provider PIN/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(onLogAudit).not.toHaveBeenCalled();
  });

  it('activates a 5 minute session and audits the exposed fields on the correct PIN', async () => {
    const user = userEvent.setup();
    const { onChange, onLogAudit } = setup();

    // Hide SSN and notes from the secondary viewer before authenticating.
    await user.click(screen.getByRole('button', { name: /SSN/ }));
    await user.click(screen.getByRole('button', { name: /notes/ }));

    await user.click(screen.getByRole('button', { name: /Badge Re-Authenticate/i }));
    await user.type(screen.getByPlaceholderText('••••'), '1234');
    await user.click(screen.getByRole('button', { name: /Confirm Biometric/i }));

    expect(onChange).toHaveBeenCalledWith({
      isActive: true,
      timeLeft: 300,
      selectedFields: {
        name: true,
        birthdate: true,
        ssn: false,
        diagnosis: true,
        medications: true,
        notes: false
      }
    });

    const [action, reason] = onLogAudit.mock.calls[0];
    expect(action).toBe('SECURITY_ALERT');
    expect(reason).toContain('NAME, BIRTHDATE, DIAGNOSIS, MEDICATIONS');
    expect(reason).not.toContain('SSN');
  });

  it('disables the confirm button until four digits are entered and strips non-digits', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /Badge Re-Authenticate/i }));
    const confirm = screen.getByRole('button', { name: /Confirm Biometric/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByPlaceholderText('••••'), '12ab34');
    expect(screen.getByPlaceholderText('••••')).toHaveValue('1234');
    expect(confirm).toBeEnabled();
  });

  it('renders the remaining time as mm:ss and warns below two minutes', () => {
    const { view } = setup(makeConsultState({ isActive: true, timeLeft: 125 }));
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(screen.queryByText(/EXPIRE WARNING/)).not.toBeInTheDocument();

    view.unmount();
    setup(makeConsultState({ isActive: true, timeLeft: 65 }));
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText(/EXPIRE WARNING/)).toBeInTheDocument();
  });

  it('marks fields hidden from the session with a struck-through badge', () => {
    setup(makeConsultState({ isActive: true, timeLeft: 300, selectedFields: { ssn: false } }));
    expect(screen.getByText('SSN').className).toContain('line-through');
    expect(screen.getByText('diagnosis').className).not.toContain('line-through');
  });

  it('counts the session down every second while active', () => {
    vi.useFakeTimers();
    try {
      const { onChange } = setup(makeConsultState({ isActive: true, timeLeft: 300 }));
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isActive: true, timeLeft: 299 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('force-expires the session and restores full visibility at zero', () => {
    vi.useFakeTimers();
    try {
      const { onChange, onLogAudit } = setup(makeConsultState({ isActive: true, timeLeft: 1 }));
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(onChange).toHaveBeenCalledWith({
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
      expect(onLogAudit).toHaveBeenCalledWith('SECURITY_ALERT', expect.stringContaining('expired automatically'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('renews the timer without changing field selection', async () => {
    const user = userEvent.setup();
    const state = makeConsultState({ isActive: true, timeLeft: 42, selectedFields: { ssn: false } });
    const { onChange, onLogAudit } = setup(state);

    await user.click(screen.getByRole('button', { name: /Renew Timer/i }));

    expect(onChange).toHaveBeenCalledWith({ ...state, timeLeft: 300 });
    expect(onLogAudit).toHaveBeenCalledWith('SECURITY_ALERT', expect.stringContaining('prolonged'));
  });

  it('restores default permissions when the provider exits consult mode', async () => {
    const user = userEvent.setup();
    const { onChange, onLogAudit } = setup(makeConsultState({ isActive: true, timeLeft: 200 }));

    await user.click(screen.getByRole('button', { name: /Exit Consult/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        timeLeft: 0,
        selectedFields: expect.objectContaining({ ssn: true, notes: true })
      })
    );
    expect(onLogAudit).toHaveBeenCalledWith('SECURITY_ALERT', expect.stringContaining('voluntarily exited'));
  });

  it('closes the re-auth dialog without activating consult mode', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: /Badge Re-Authenticate/i }));
    expect(screen.getByText(/Physician Badge Re-Auth/i)).toBeInTheDocument();

    await user.click(screen.getByText(/Physician Badge Re-Auth/i).closest('div')!.parentElement!.querySelector('button')!);

    expect(screen.queryByText(/Physician Badge Re-Auth/i)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
