import { apiRequest, ApiError } from "./client";
import type {
  DownloadInfo,
  FileListFilters,
  FileVersion,
  Paginated,
  PresignUploadResponse,
  StoredFile,
  UpdateFilePayload,
} from "../types";

export async function listFiles(
  accessToken: string,
  projectId: string,
  folderId?: string | null,
  includeDeleted = false,
  filters: FileListFilters = {},
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
  if (filters.filterMode) params.set("filter_mode", "true");
  if (filters.uploadedAfter) params.set("uploaded_after", filters.uploadedAfter);
  if (filters.uploadedBefore) params.set("uploaded_before", filters.uploadedBefore);
  if (filters.fileType) params.set("file_type", filters.fileType);
  if (filters.sizeMin != null) params.set("size_min", String(filters.sizeMin));
  if (filters.sizeMax != null) params.set("size_max", String(filters.sizeMax));
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.tag) params.set("tag", filters.tag);

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
    tags = [],
  }: {
    projectId: string;
    folderId: string | null;
    file: File;
    tags?: string[];
  },
) {
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
        tags,
      }),
    },
    accessToken,
  );

  let putResponse: Response;
  try {
    putResponse = await fetch(session.upload_url, {
      method: "PUT",
      body: file,
      mode: "cors",
    });
  } catch {
    throw new ApiError(
      0,
      "S3 CORS blocked the upload. From server/: python scripts/configure_s3_cors.py",
    );
  }
  if (!putResponse.ok) {
    const bodyText = await putResponse.text().catch(() => "");
    throw new ApiError(
      putResponse.status,
      `S3 upload failed (${putResponse.status}). ${bodyText.slice(0, 200) || "Check IAM PutObject + bucket CORS."}`,
    );
  }

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

export function updateFile(accessToken: string, fileId: string, payload: UpdateFilePayload) {
  return apiRequest<StoredFile>(
    `/files/${fileId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
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
