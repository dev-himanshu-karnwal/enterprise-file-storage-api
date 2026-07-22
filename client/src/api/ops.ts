import { apiRequest } from "./client";
import type { AuditLog, Paginated, SearchFileResult } from "../types";

export function searchFiles(
  accessToken: string,
  {
    q,
    extension,
    projectId,
    page = 1,
    pageSize = 20,
  }: {
    q?: string;
    extension?: string;
    projectId?: string;
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
