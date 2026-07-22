export type UserRole = "admin" | "member" | "read_only";

export interface User {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  storage_limit: number;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface AuthResponse {
  user: User;
  tokens: TokenPair;
}

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
  organization_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  password?: string;
}

export interface UpdateOrganizationPayload {
  name?: string;
  storage_limit?: number;
}

export interface ForgotPasswordResponse {
  message: string;
  reset_token?: string | null;
}

export interface ApiErrorBody {
  detail?: string | { msg: string }[];
}
