import type { ApiErrorBody } from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

const ACCESS_KEY = "efs_access_token";
const REFRESH_KEY = "efs_refresh_token";
const USER_KEY = "efs_user";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function parseDetail(body: ApiErrorBody | null): string {
  if (!body?.detail) return "Something went wrong";
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((item) => item.msg).join(". ");
  }
  return "Something went wrong";
}

type TokenListener = (access: string, refresh: string) => void;
type SessionClearedListener = () => void;

let onTokensRefreshed: TokenListener | null = null;
let onSessionCleared: SessionClearedListener | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setTokenRefreshListener(listener: TokenListener | null) {
  onTokensRefreshed = listener;
}

export function setSessionClearedListener(listener: SessionClearedListener | null) {
  onSessionCleared = listener;
}

function clearStoredSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  onSessionCleared?.();
}

function isAuthPath(path: string) {
  return (
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/signup") ||
    path.startsWith("/auth/register")
  );
}

/**
 * Exchange the refresh token for a new access token.
 * Only clears the session on a definitive auth rejection (401/403).
 * Transient failures (network, 5xx) leave the session intact.
 */
async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Network blip — keep session, let the caller surface the original error.
      return null;
    }

    if (!response.ok) {
      // Only wipe credentials when the server says the refresh token is bad.
      if (response.status === 401 || response.status === 403) {
        clearStoredSession();
      }
      return null;
    }

    const body = (await response.json()) as {
      user: unknown;
      tokens: { access_token: string; refresh_token: string };
    };

    localStorage.setItem(ACCESS_KEY, body.tokens.access_token);
    localStorage.setItem(REFRESH_KEY, body.tokens.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(body.user));
    onTokensRefreshed?.(body.tokens.access_token, body.tokens.refresh_token);
    return body.tokens.access_token;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string | null,
  retryOnUnauthorized = true,
): Promise<T> {
  // Prefer the newest token from storage — React state can briefly lag after a refresh.
  const token = localStorage.getItem(ACCESS_KEY) ?? accessToken ?? null;

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retryOnUnauthorized && token && !isAuthPath(path)) {
    // Another request may have already refreshed while we were in flight.
    const latest = localStorage.getItem(ACCESS_KEY);
    if (latest && latest !== token) {
      return apiRequest<T>(path, options, latest, false);
    }

    const nextAccess = await tryRefreshAccessToken();
    if (nextAccess) {
      return apiRequest<T>(path, options, nextAccess, false);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as ApiErrorBody | T | null;

  if (!response.ok) {
    throw new ApiError(response.status, parseDetail(body as ApiErrorBody | null));
  }

  return body as T;
}
