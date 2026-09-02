let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function getAccessToken(): string | null {
  return accessToken;
}

export function authorizedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.delete('X-User-Role');
  headers.delete('X-User-Id');

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  return fetch(input, {
    ...init,
    credentials: 'same-origin',
    headers
  });
}

export function isValidVerificationToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}
