import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as authApi from "../api/auth";
import { ApiError, setSessionClearedListener, setTokenRefreshListener } from "../api/client";
import type {
  CreateUserPayload,
  LoginPayload,
  Organization,
  SignupPayload,
  UpdateOrganizationPayload,
  UpdateUserPayload,
  User,
} from "../types";

const ACCESS_KEY = "efs_access_token";
const REFRESH_KEY = "efs_refresh_token";
const USER_KEY = "efs_user";

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  signup: (payload: SignupPayload) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  createUser: (payload: CreateUserPayload) => Promise<User>;
  updateUser: (userId: string, payload: UpdateUserPayload) => Promise<User>;
  deleteUser: (userId: string) => Promise<void>;
  listUsers: () => Promise<User[]>;
  listOrganizations: () => Promise<Organization[]>;
  updateOrganization: (
    organizationId: string,
    payload: UpdateOrganizationPayload,
  ) => Promise<Organization>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persistSession(user: User, access: string, refresh: string) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

function clearSession() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function readStoredSession(): {
  user: User;
  access: string;
  refresh: string;
} | null {
  const storedUser = localStorage.getItem(USER_KEY);
  const storedAccess = localStorage.getItem(ACCESS_KEY);
  const storedRefresh = localStorage.getItem(REFRESH_KEY);
  if (!storedUser || !storedAccess || !storedRefresh) return null;
  try {
    return {
      user: JSON.parse(storedUser) as User,
      access: storedAccess,
      refresh: storedRefresh,
    };
  } catch {
    clearSession();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTokenRefreshListener((access, refresh) => {
      setAccessToken(access);
      setRefreshToken(refresh);
      const storedUser = localStorage.getItem(USER_KEY);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser) as User);
        } catch {
          // ignore malformed cache; next /me will refresh it
        }
      }
    });
    setSessionClearedListener(() => {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
    });
    return () => {
      setTokenRefreshListener(null);
      setSessionClearedListener(null);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredSession();

    if (!stored) {
      setLoading(false);
      return;
    }

    setUser(stored.user);
    setAccessToken(stored.access);
    setRefreshToken(stored.refresh);

    // Validate the session. apiRequest already refreshes on 401.
    // Never wipe the session on transient errors (network, 5xx, Strict Mode races).
    authApi
      .getMe(stored.access)
      .then((fresh) => {
        if (cancelled) return;
        setUser(fresh);
        localStorage.setItem(USER_KEY, JSON.stringify(fresh));
        const nextAccess = localStorage.getItem(ACCESS_KEY);
        const nextRefresh = localStorage.getItem(REFRESH_KEY);
        if (nextAccess) setAccessToken(nextAccess);
        if (nextRefresh) setRefreshToken(nextRefresh);
      })
      .catch((err) => {
        if (cancelled) return;
        // Only log out when auth is definitively rejected and storage was cleared
        // by the refresh helper (or tokens are gone).
        const stillHasSession = Boolean(localStorage.getItem(REFRESH_KEY));
        if (err instanceof ApiError && err.status === 401 && !stillHasSession) {
          clearSession();
          setUser(null);
          setAccessToken(null);
          setRefreshToken(null);
        }
        // Otherwise keep the cached user — a blip should not force re-login.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback(async (result: Awaited<ReturnType<typeof authApi.login>>) => {
    persistSession(result.user, result.tokens.access_token, result.tokens.refresh_token);
    setUser(result.user);
    setAccessToken(result.tokens.access_token);
    setRefreshToken(result.tokens.refresh_token);
  }, []);

  const signup = useCallback(
    async (payload: SignupPayload) => {
      const result = await authApi.signup(payload);
      await applyAuth(result);
    },
    [applyAuth],
  );

  const login = useCallback(
    async (payload: LoginPayload) => {
      const result = await authApi.login(payload);
      await applyAuth(result);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const access = localStorage.getItem(ACCESS_KEY) ?? accessToken;
    const refresh = localStorage.getItem(REFRESH_KEY) ?? refreshToken;
    if (access && refresh) {
      try {
        await authApi.logout(access, refresh);
      } catch {
        // Clear local session even if the server revoke fails.
      }
    }
    clearSession();
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }, [accessToken, refreshToken]);

  const createUser = useCallback(
    async (payload: CreateUserPayload) => {
      if (!accessToken) throw new Error("Not authenticated");
      return authApi.createUser(accessToken, payload);
    },
    [accessToken],
  );

  const updateUser = useCallback(
    async (userId: string, payload: UpdateUserPayload) => {
      if (!accessToken) throw new Error("Not authenticated");
      const updated = await authApi.updateUser(accessToken, userId, payload);
      if (user?.id === userId) {
        setUser(updated);
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
      }
      return updated;
    },
    [accessToken, user?.id],
  );

  const deleteUser = useCallback(
    async (userId: string) => {
      if (!accessToken) throw new Error("Not authenticated");
      await authApi.deleteUser(accessToken, userId);
    },
    [accessToken],
  );

  const listUsers = useCallback(async () => {
    if (!accessToken) throw new Error("Not authenticated");
    return authApi.listUsers(accessToken);
  }, [accessToken]);

  const listOrganizations = useCallback(async () => {
    if (!accessToken) throw new Error("Not authenticated");
    return authApi.listOrganizations(accessToken);
  }, [accessToken]);

  const updateOrganization = useCallback(
    async (organizationId: string, payload: UpdateOrganizationPayload) => {
      if (!accessToken) throw new Error("Not authenticated");
      return authApi.updateOrganization(accessToken, organizationId, payload);
    },
    [accessToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      loading,
      signup,
      login,
      logout,
      createUser,
      updateUser,
      deleteUser,
      listUsers,
      listOrganizations,
      updateOrganization,
      isAdmin: user?.role === "admin",
    }),
    [
      user,
      accessToken,
      loading,
      signup,
      login,
      logout,
      createUser,
      updateUser,
      deleteUser,
      listUsers,
      listOrganizations,
      updateOrganization,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
