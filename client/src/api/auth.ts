import { apiRequest } from "./client";
import type {
  AuthResponse,
  CreateUserPayload,
  ForgotPasswordResponse,
  LoginPayload,
  Organization,
  SignupPayload,
  UpdateOrganizationPayload,
  UpdateUserPayload,
  User,
} from "../types";

export function signup(payload: SignupPayload) {
  return apiRequest<AuthResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login(payload: LoginPayload) {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function refresh(refreshToken: string) {
  return apiRequest<AuthResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function logout(accessToken: string, refreshToken: string) {
  return apiRequest<{ message: string }>(
    "/auth/logout",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
    accessToken,
  );
}

export function forgotPassword(email: string) {
  return apiRequest<ForgotPasswordResponse>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, newPassword: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export function getMe(accessToken: string) {
  return apiRequest<User>("/auth/me", { method: "GET" }, accessToken);
}

export function listUsers(accessToken: string) {
  return apiRequest<User[]>("/users", { method: "GET" }, accessToken);
}

export function createUser(accessToken: string, payload: CreateUserPayload) {
  return apiRequest<User>(
    "/users",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function updateUser(accessToken: string, userId: string, payload: UpdateUserPayload) {
  return apiRequest<User>(
    `/users/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function deleteUser(accessToken: string, userId: string) {
  return apiRequest<void>(`/users/${userId}`, { method: "DELETE" }, accessToken);
}

export function listOrganizations(accessToken: string) {
  return apiRequest<Organization[]>("/organizations", { method: "GET" }, accessToken);
}

export function updateOrganization(
  accessToken: string,
  organizationId: string,
  payload: UpdateOrganizationPayload,
) {
  return apiRequest<Organization>(
    `/organizations/${organizationId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}
