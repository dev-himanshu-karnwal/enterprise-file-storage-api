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

let onTokensRefreshed: TokenListener | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setTokenRefreshListener(listener: TokenListener | null) {
  onTokensRefreshed = listener;
}

async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
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
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (
    response.status === 401 &&
    retryOnUnauthorized &&
    accessToken &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/refresh") &&
    !path.startsWith("/auth/signup") &&
    !path.startsWith("/auth/register")
  ) {
    const nextAccess = await tryRefreshAccessToken();
    if (nextAccess) {
      return apiRequest<T>(path, options, nextAccess, { retryOnUnauthorized: false });
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
