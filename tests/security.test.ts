import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizedFetch, isValidVerificationToken, setAccessToken } from '../security';

afterEach(() => {
  setAccessToken(null);
});

describe('authorizedFetch', () => {
  it('attaches a bearer token only when one is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await authorizedFetch('/api/secure');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBeNull();

    setAccessToken('test-access-token');
    await authorizedFetch('/api/secure');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe(
      'Bearer test-access-token'
    );
  });

  it('strips client-asserted identity headers and uses same-origin credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('test-access-token');

    await authorizedFetch('/api/secure', {
      headers: {
        'X-User-Role': 'Provider',
        'X-User-Id': 'client-asserted',
        'X-Request-Id': 'request-1'
      }
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get('X-User-Role')).toBeNull();
    expect(headers.get('X-User-Id')).toBeNull();
    expect(headers.get('X-Request-Id')).toBe('request-1');
    expect(init.credentials).toBe('same-origin');
  });
});

describe('isValidVerificationToken', () => {
  it('accepts allowlisted values at both length boundaries', () => {
    expect(isValidVerificationToken('a'.repeat(8))).toBe(true);
    expect(isValidVerificationToken('a'.repeat(128))).toBe(true);
    expect(isValidVerificationToken('Ab09_-xy')).toBe(true);
  });

  it('rejects values outside the allowlist or length bounds', () => {
    expect(isValidVerificationToken('a'.repeat(7))).toBe(false);
    expect(isValidVerificationToken('a'.repeat(129))).toBe(false);
    expect(isValidVerificationToken('valid.code')).toBe(false);
    expect(isValidVerificationToken('valid/code')).toBe(false);
    expect(isValidVerificationToken('valid\\code')).toBe(false);
    expect(isValidVerificationToken('valid code')).toBe(false);
    expect(isValidVerificationToken('')).toBe(false);
  });
});
