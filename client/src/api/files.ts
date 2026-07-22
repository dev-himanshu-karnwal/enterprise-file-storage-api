import { apiRequest, ApiError } from "./client";
import type {
  DownloadInfo,
  FileVersion,
  Paginated,
  PresignUploadResponse,
  StoredFile,
} from "../types";

export async function listFiles(
  accessToken: string,
  projectId: string,
  folderId?: string | null,
  includeDeleted = false,
) {
  const params = new URLSearchParams({
    project_id: projectId,
    page: "1",
    page_size: "100",
    sort: "filename",
    order: "asc",
  });
  if (includeDeleted) {
    params.set("include_deleted", "true");
  } else if (folderId) {
    params.set("folder_id", folderId);
  }
  const result = await apiRequest<Paginated<StoredFile>>(
    `/files?${params.toString()}`,
    { method: "GET" },
    accessToken,
  );
  return result.items;
}

async function sha256Hex(file: File): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  // 1) Ask API for a short-lived S3 PUT URL
  const session = await apiRequest<PresignUploadResponse>(
    "/files/uploads/presign",
    {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        folder_id: folderId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size: file.size,
      }),
    },
    accessToken,
  );

  // 2) Browser uploads bytes directly to S3 (not through our API)
  const putResponse = await fetch(session.upload_url, {
    method: "PUT",
    headers: session.headers,
    body: file,
  });
  if (!putResponse.ok) {
    throw new ApiError(
      putResponse.status,
      `S3 upload failed (${putResponse.status}). Check bucket CORS allows PUT from this origin.`,
    );
  }

  // 3) Tell API the object is in S3 so it can save metadata
  const checksum = await sha256Hex(file);
  return apiRequest<StoredFile>(
    "/files/uploads/complete",
    {
      method: "POST",
      body: JSON.stringify({
        upload_id: session.upload_id,
        checksum: checksum ?? null,
      }),
    },
    accessToken,
  );
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
