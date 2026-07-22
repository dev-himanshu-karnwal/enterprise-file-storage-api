import { apiRequest } from "./client";
import type {
  AuthResponse,
  CreateUserPayload,
  LoginPayload,
  SignupPayload,
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
