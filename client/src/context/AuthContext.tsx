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
import { setTokenRefreshListener } from "../api/client";
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
        setUser(JSON.parse(storedUser) as User);
      }
    });
    return () => setTokenRefreshListener(null);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem(USER_KEY);
    const storedAccess = localStorage.getItem(ACCESS_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_KEY);

    if (!storedUser || !storedAccess || !storedRefresh) {
      setLoading(false);
      return;
    }

    setUser(JSON.parse(storedUser) as User);
    setAccessToken(storedAccess);
    setRefreshToken(storedRefresh);

    authApi
      .getMe(storedAccess)
      .then((fresh) => {
        setUser(fresh);
        localStorage.setItem(USER_KEY, JSON.stringify(fresh));
      })
      .catch(async () => {
        try {
          const renewed = await authApi.refresh(storedRefresh);
          persistSession(
            renewed.user,
            renewed.tokens.access_token,
            renewed.tokens.refresh_token,
          );
          setUser(renewed.user);
          setAccessToken(renewed.tokens.access_token);
          setRefreshToken(renewed.tokens.refresh_token);
        } catch {
          clearSession();
          setUser(null);
          setAccessToken(null);
          setRefreshToken(null);
        }
      })
      .finally(() => setLoading(false));
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
    if (accessToken && refreshToken) {
      try {
        await authApi.logout(accessToken, refreshToken);
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
