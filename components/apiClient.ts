/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserSession } from '../types';

/**
 * Thrown when the compliance API is reachable but rejects the call. `status` is
 * the HTTP status; a transport failure surfaces as `NetworkError` instead.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Thrown when the request never reached the compliance API. */
export class NetworkError extends Error {
  constructor(message = 'Network Connection Unreachable') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Actor attribution headers. Every mutating call is Envers-audited server side,
 * so the acting user and role must travel with the request.
 */
export function actorHeaders(currentUser: UserSession | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-User-Role': currentUser?.role || 'Provider',
    'X-User-Id': currentUser?.userId || 'anonymous'
  };
}

interface RequestJsonOptions {
  method?: string;
  actor?: UserSession | null;
  body?: unknown;
  /** Fallback message when the server does not return an `error` field. */
  errorMessage?: string;
}

/**
 * Performs a JSON request and normalises failures: server rejections become
 * `ApiError` (preferring the body's `error` field), transport failures become
 * `NetworkError`.
 */
export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const { method = 'GET', actor, body, errorMessage = 'The compliance server rejected the request.' } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: actor !== undefined ? actorHeaders(actor) : undefined,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    throw new NetworkError();
  }

  if (!response.ok) {
    let serverMessage: string | undefined;
    try {
      const errData = await response.json();
      serverMessage = errData?.error;
    } catch {
      serverMessage = undefined;
    }
    throw new ApiError(serverMessage || errorMessage, response.status);
  }

  return response.json() as Promise<T>;
}
