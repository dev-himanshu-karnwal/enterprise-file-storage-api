import { apiRequest } from "./client";
import type { DownloadInfo, FileVersion, StoredFile } from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export function listFiles(
  accessToken: string,
  projectId: string,
  folderId?: string | null,
  includeDeleted = false,
) {
  const params = new URLSearchParams({ project_id: projectId });
  if (includeDeleted) {
    params.set("include_deleted", "true");
  } else if (folderId) {
    params.set("folder_id", folderId);
  }
  return apiRequest<StoredFile[]>(`/files?${params.toString()}`, { method: "GET" }, accessToken);
}

export async function uploadFile(
  accessToken: string,
  {
    projectId,
    folderId,
    file,
  }: {
    projectId: string;
    folderId: string | null;
    file: File;
  },
) {
  const body = new FormData();
  body.append("project_id", projectId);
  if (folderId) body.append("folder_id", folderId);
  body.append("file", file);

  const response = await fetch(`${API_BASE}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : Array.isArray(payload?.detail)
          ? payload.detail.map((item: { msg: string }) => item.msg).join(". ")
          : "Upload failed";
    const { ApiError } = await import("./client");
    throw new ApiError(response.status, detail);
  }
  return payload as StoredFile;
}

export function getDownload(accessToken: string, fileId: string, version?: number) {
  const params = version != null ? `?version=${version}` : "";
  return apiRequest<DownloadInfo>(
    `/files/${fileId}/download${params}`,
    { method: "GET" },
    accessToken,
  );
}

export function deleteFile(accessToken: string, fileId: string) {
  return apiRequest<void>(`/files/${fileId}`, { method: "DELETE" }, accessToken);
}

export function restoreFile(accessToken: string, fileId: string) {
  return apiRequest<StoredFile>(`/files/${fileId}/restore`, { method: "POST" }, accessToken);
}

export function listVersions(accessToken: string, fileId: string) {
  return apiRequest<FileVersion[]>(`/files/${fileId}/versions`, { method: "GET" }, accessToken);
}

export function restoreVersion(accessToken: string, fileId: string, version: number) {
  return apiRequest<StoredFile>(
    `/files/${fileId}/restore-version/${version}`,
    { method: "POST" },
    accessToken,
  );
}
