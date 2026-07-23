import { apiRequest } from "./client";
import type { AuditLog, FileTypeFilter, Paginated, SearchFileResult } from "../types";

export function searchFiles(
  accessToken: string,
  {
    q,
    extension,
    projectId,
    folderId,
    tag,
    uploadedBy,
    uploadedAfter,
    uploadedBefore,
    fileType,
    sizeMin,
    sizeMax,
    page = 1,
    pageSize = 20,
  }: {
    q?: string;
    extension?: string;
    projectId?: string;
    folderId?: string;
    tag?: string;
    uploadedBy?: string;
    uploadedAfter?: string;
    uploadedBefore?: string;
    fileType?: FileTypeFilter | "";
    sizeMin?: number;
    sizeMax?: number;
    page?: number;
    pageSize?: number;
  },
) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    sort: "filename",
    order: "asc",
  });
  if (q) params.set("q", q);
  if (extension) params.set("extension", extension);
  if (projectId) params.set("project_id", projectId);
  if (folderId) params.set("folder_id", folderId);
  if (tag) params.set("tag", tag);
  if (uploadedBy) params.set("uploaded_by", uploadedBy);
  if (uploadedAfter) params.set("uploaded_after", uploadedAfter);
  if (uploadedBefore) params.set("uploaded_before", uploadedBefore);
  if (fileType) params.set("file_type", fileType);
  if (sizeMin != null) params.set("size_min", String(sizeMin));
  if (sizeMax != null) params.set("size_max", String(sizeMax));
  return apiRequest<Paginated<SearchFileResult>>(
    `/search/files?${params.toString()}`,
    { method: "GET" },
    accessToken,
  );
}

export function listAuditLogs(
  accessToken: string,
  {
    action,
    page = 1,
    pageSize = 20,
  }: {
    action?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    sort: "created_at",
    order: "desc",
  });
  if (action) params.set("action", action);
  return apiRequest<Paginated<AuditLog>>(
    `/audit-logs?${params.toString()}`,
    { method: "GET" },
    accessToken,
  );
}
