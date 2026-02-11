import type { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import api from './api';

export type GetTokenFn = () => Promise<string | null>;

export class MissingAuthTokenError extends Error {
  constructor() {
    super('Authentication token is missing');
    this.name = 'MissingAuthTokenError';
  }
}

/**
 * Emit the same auth error event that the API interceptor uses,
 * ensuring consistent auth error handling across the app.
 */
function emitAuthError(status: number = 401) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('three-squares:auth-error', {
        detail: { status },
      })
    );
  }
}

/**
 * Create a rejected promise that mimics an Axios 401 error response.
 * This ensures callers can handle it the same way as HTTP errors.
 */
function createAuthErrorResponse(): Promise<never> {
  const error = {
    response: {
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Authentication token is missing' },
    },
    message: 'Authentication token is missing',
    isAxiosError: true,
  } as AxiosError;

  return Promise.reject(error);
}

async function buildAuthHeaders(getToken: GetTokenFn, headers?: Record<string, string>) {
  const token = await getToken();
  if (!token) {
    // Emit auth error event for consistent handling
    emitAuthError(401);
    // Return null to signal auth failure (caller should handle)
    return null;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

export async function authGet<T = unknown>(
  path: string,
  getToken: GetTokenFn,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const headers = await buildAuthHeaders(getToken, config.headers as Record<string, string> | undefined);
  if (!headers) {
    return createAuthErrorResponse();
  }
  return api.get<T>(path, { ...config, headers });
}

export async function authPost<T = unknown>(
  path: string,
  data: unknown,
  getToken: GetTokenFn,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const headers = await buildAuthHeaders(getToken, config.headers as Record<string, string> | undefined);
  if (!headers) {
    return createAuthErrorResponse();
  }
  return api.post<T>(path, data, { ...config, headers });
}

export async function authPatch<T = unknown>(
  path: string,
  data: unknown,
  getToken: GetTokenFn,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const headers = await buildAuthHeaders(getToken, config.headers as Record<string, string> | undefined);
  if (!headers) {
    return createAuthErrorResponse();
  }
  return api.patch<T>(path, data, { ...config, headers });
}

export async function authPut<T = unknown>(
  path: string,
  data: unknown,
  getToken: GetTokenFn,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const headers = await buildAuthHeaders(getToken, config.headers as Record<string, string> | undefined);
  if (!headers) {
    return createAuthErrorResponse();
  }
  return api.put<T>(path, data, { ...config, headers });
}

export async function authDelete<T = unknown>(
  path: string,
  getToken: GetTokenFn,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> {
  const headers = await buildAuthHeaders(getToken, config.headers as Record<string, string> | undefined);
  if (!headers) {
    return createAuthErrorResponse();
  }
  return api.delete<T>(path, { ...config, headers });
}
