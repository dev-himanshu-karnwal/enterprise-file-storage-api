import { apiRequest } from "./client";
import type {
  CreateFolderPayload,
  CreateProjectPayload,
  Folder,
  Paginated,
  Project,
  UpdateFolderPayload,
  UpdateProjectPayload,
} from "../types";

function pageQuery(page = 1, pageSize = 100) {
  return `page=${page}&page_size=${pageSize}`;
}

export async function listProjects(accessToken: string) {
  const result = await apiRequest<Paginated<Project>>(
    `/projects?${pageQuery(1, 100)}&sort=created_at&order=asc`,
    { method: "GET" },
    accessToken,
  );
  return result.items;
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

export async function listFolders(
  accessToken: string,
  projectId: string,
  parentFolderId?: string | null,
  includeDeleted = false,
  allFolders = false,
) {
  const params = new URLSearchParams({
    project_id: projectId,
    page: "1",
    page_size: "100",
    sort: "name",
    order: "asc",
  });
  if (includeDeleted) {
    params.set("include_deleted", "true");
  } else if (allFolders) {
    params.set("all_folders", "true");
  } else if (parentFolderId) {
    params.set("parent_folder_id", parentFolderId);
  }
  const result = await apiRequest<Paginated<Folder>>(
    `/folders?${params.toString()}`,
    { method: "GET" },
    accessToken,
  );
  return result.items;
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
