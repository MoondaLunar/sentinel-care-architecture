/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { webcrypto } from 'node:crypto';
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom ships no WebCrypto implementation, but the audit hash-chain relies on
// window.crypto.subtle.digest to recompute SHA-256 fingerprints.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
