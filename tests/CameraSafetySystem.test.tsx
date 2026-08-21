/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CameraSafetySystem from '../components/CameraSafetySystem';
import { CameraAttentionState } from '../types';
import { makeUser } from './fixtures';

let pendingFrames: FrameRequestCallback[] = [];

function setup(options: { getUserMedia?: () => Promise<MediaStream>; idleSecondsLeft?: number } = {}) {
  const onStateChange = vi.fn();
  const onLogSecurityBypass = vi.fn();
  const onTriggerInactivityTimeout = vi.fn();
  const getUserMedia =
    options.getUserMedia ??
    (async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream);

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(getUserMedia) },
    configurable: true
  });

  render(
    <CameraSafetySystem
      onStateChange={onStateChange}
      currentUser={makeUser()}
      onLogSecurityBypass={onLogSecurityBypass}
      onTriggerInactivityTimeout={onTriggerInactivityTimeout}
      idleSecondsLeft={options.idleSecondsLeft}
    />
  );

  return { onStateChange, onLogSecurityBypass, onTriggerInactivityTimeout };
}

beforeEach(() => {
  pendingFrames = [];

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

const statusBadge = () => document.querySelector('#vision-security-panel span.rounded-full') as HTMLElement;

describe('CameraSafetySystem camera acquisition', () => {
  it('requests a low resolution front facing stream', async () => {
    setup();

    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { width: 160, height: 120, facingMode: 'user' }
      })
    );
  });

  /**
   * The video element only renders once `isCameraActive` is set, but the effect
   * that sets it requires the element's ref, so the granted-permission path
   * still shows the simulator overlay.
   */
  it('keeps the simulator overlay even after permission is granted', async () => {
    setup();

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    expect(screen.getByText('Camera Feed Inactive / Blocked')).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(pendingFrames).toHaveLength(0);
  });

  it('falls back to the simulator when the camera is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    setup({ getUserMedia: () => Promise.reject(new Error('NotAllowedError')) });

    expect(await screen.findByText('Camera Feed Inactive / Blocked')).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(pendingFrames).toHaveLength(0);
  });

  it('reports the default metrics before any frame is analysed', () => {
    setup();

    const hud = document.querySelector('#vision-security-panel .absolute.inset-x-0') as HTMLElement;
    expect(hud.textContent).toContain('LIGHT: 100%');
    expect(hud.textContent).toContain('MOTION: 0%');
    expect(hud.textContent).toContain('FOCAL: 98%');
  });
});

describe('CameraSafetySystem operator overrides', () => {
  it('pins the attention state to the selected preset', async () => {
    const user = userEvent.setup();
    const { onStateChange } = setup();

    await user.click(screen.getByRole('button', { name: /Multi-Person Hover/ }));

    expect(onStateChange).toHaveBeenLastCalledWith(CameraAttentionState.MULTI_PERSON);
    expect(statusBadge()).toHaveTextContent('MULTI PERSON');
    expect(screen.getByText('PRIVACY SHIELD ENGAGED')).toBeInTheDocument();
  });

  it('resumes live analysis when the preset is cleared', async () => {
    const user = userEvent.setup();
    const { onStateChange } = setup();

    await user.click(screen.getByRole('button', { name: /Low Light \/ Mask/ }));
    await user.click(screen.getByRole('button', { name: /Clear preset and resume live analysis/ }));

    expect(onStateChange).toHaveBeenLastCalledWith(CameraAttentionState.SAFE_FOCUS);
    expect(
      screen.queryByRole('button', { name: /Clear preset and resume live analysis/ })
    ).not.toBeInTheDocument();
  });

  it('counts down the soft lock once per second', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();

    await user.click(screen.getByRole('button', { name: /Empty Desk \/ No Face/ }));
    expect(screen.getByText('LOCKING IN 5s')).toBeInTheDocument();

    for (const remaining of ['LOCKING IN 4s', 'LOCKING IN 3s']) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(remaining)).toBeInTheDocument();
    }
  });

  it('logs an emergency bypass and restores clinical access', async () => {
    const user = userEvent.setup();
    const { onLogSecurityBypass, onStateChange } = setup();

    await user.click(screen.getByRole('button', { name: /Empty Desk \/ No Face/ }));
    await user.click(screen.getByRole('button', { name: /Clinical Emergency Access/ }));

    expect(onLogSecurityBypass).toHaveBeenCalledWith(
      'EMERGENCY BYPASS TRIGGERED: User bypassed vision-based safety screen lock. Clinical urgency override applied.'
    );
    expect(onStateChange).toHaveBeenLastCalledWith(CameraAttentionState.SAFE_FOCUS);
    expect(screen.getByText(/EMERGENCY BYPASS ACTIVE/)).toBeInTheDocument();
    expect(screen.queryByText(/LOCKING IN/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clinical Emergency Access/ })).not.toBeInTheDocument();
  });

  it('drops an active preset when the bypass is engaged', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /Low Light \/ Mask/ }));
    await user.click(screen.getByRole('button', { name: /Clinical Emergency Access/ }));

    expect(statusBadge()).toHaveTextContent('SAFE FOCUS');
    expect(
      screen.queryByRole('button', { name: /Clear preset and resume live analysis/ })
    ).not.toBeInTheDocument();
  });

  it('forwards the inactivity simulation and renders the idle countdown', async () => {
    const user = userEvent.setup();
    const { onTriggerInactivityTimeout } = setup({ idleSecondsLeft: 42 });

    expect(screen.getByText('42s')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Simulate Inactivity Timeout/ }));

    expect(onTriggerInactivityTimeout).toHaveBeenCalledTimes(1);
  });

  it('omits the idle countdown when the shell does not track activity', () => {
    setup();

    expect(screen.queryByText(/remaining before inactivity timeout/)).not.toBeInTheDocument();
  });
});
