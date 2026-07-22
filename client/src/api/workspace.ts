import { apiRequest } from "./client";
import type {
  CreateFolderPayload,
  CreateProjectPayload,
  Folder,
  Project,
  UpdateFolderPayload,
  UpdateProjectPayload,
} from "../types";

export function listProjects(accessToken: string) {
  return apiRequest<Project[]>("/projects", { method: "GET" }, accessToken);
}

export function createProject(accessToken: string, payload: CreateProjectPayload) {
  return apiRequest<Project>(
    "/projects",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

export function updateProject(
  accessToken: string,
  projectId: string,
  payload: UpdateProjectPayload,
) {
  return apiRequest<Project>(
    `/projects/${projectId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
}

export function deleteProject(accessToken: string, projectId: string) {
  return apiRequest<void>(`/projects/${projectId}`, { method: "DELETE" }, accessToken);
}

export function listFolders(
  accessToken: string,
  projectId: string,
  parentFolderId?: string | null,
  includeDeleted = false,
) {
  const params = new URLSearchParams({ project_id: projectId });
  if (includeDeleted) {
    params.set("include_deleted", "true");
  } else if (parentFolderId) {
    params.set("parent_folder_id", parentFolderId);
  }
  return apiRequest<Folder[]>(`/folders?${params.toString()}`, { method: "GET" }, accessToken);
}

export function getFolder(accessToken: string, folderId: string) {
  return apiRequest<Folder>(`/folders/${folderId}`, { method: "GET" }, accessToken);
}

export function createFolder(accessToken: string, payload: CreateFolderPayload) {
  return apiRequest<Folder>(
    "/folders",
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
}

export function updateFolder(
  accessToken: string,
  folderId: string,
  payload: UpdateFolderPayload,
) {
  return apiRequest<Folder>(
    `/folders/${folderId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
}

export function deleteFolder(accessToken: string, folderId: string) {
  return apiRequest<void>(`/folders/${folderId}`, { method: "DELETE" }, accessToken);
}

export function restoreFolder(accessToken: string, folderId: string) {
  return apiRequest<Folder>(`/folders/${folderId}/restore`, { method: "POST" }, accessToken);
}
