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

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  path: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string | null;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string | null;
}

export interface CreateFolderPayload {
  project_id: string;
  name: string;
  parent_folder_id?: string | null;
}

export interface UpdateFolderPayload {
  name?: string;
  parent_folder_id?: string | null;
}

export interface StoredFile {
  id: string;
  project_id: string;
  folder_id: string | null;
  current_version: number;
  filename: string;
  extension: string;
  mime_type: string;
  size: number;
  checksum: string;
  storage_key: string;
  uploaded_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileVersion {
  id: string;
  file_id: string;
  version: number;
  storage_key: string;
  size: number;
  checksum: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface DownloadInfo {
  download_url: string;
  expires_in: number;
  filename: string;
  version: number;
  size: number;
  mime_type: string;
}

export interface ApiErrorBody {
  detail?: string | { msg: string }[];
}
