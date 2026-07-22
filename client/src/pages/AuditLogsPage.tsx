import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { listAuditLogs } from "../api/ops";
import { useAuth } from "../context/AuthContext";
import type { AuditLog } from "../types";

const ACTION_FILTERS = [
  "",
  "LOGIN",
  "UPLOAD",
  "DOWNLOAD",
  "DELETE",
  "RESTORE",
  "CREATE_FOLDER",
  "CREATE_USER",
  "UPDATE_ROLE",
];

export function AuditLogsPage() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextPage = 1, nextAction = action) {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listAuditLogs(accessToken, {
        action: nextAction || undefined,
        page: nextPage,
        pageSize: 20,
      });
      setLogs(data.items);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(1);
  }, [accessToken]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit logs</h1>
          <p>Important actions across your organization. Admin only.</p>
        </div>
      </div>

      <div className="toolbar-bar">
        <label className="field inline-field">
          <span>Action</span>
          <select
            value={action}
            onChange={(e) => {
              const value = e.target.value;
              setAction(value);
              void refresh(1, value);
            }}
          >
            {ACTION_FILTERS.map((item) => (
              <option key={item || "all"} value={item}>
                {item || "All actions"}
              </option>
            ))}
          </select>
        </label>
        <span className="field-hint">{total} event{total === 1 ? "" : "s"}</span>
      </div>

      {error && <div className="alert alert-error page-alert">{error}</div>}

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <p>Loading audit logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <h2>No audit events yet</h2>
            <p>Login, upload, and admin actions will appear here.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>User</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString()}</td>
                      <td>
                        <span className="badge">{log.action}</span>
                      </td>
                      <td>
                        {log.entity}
                        {log.entity_id ? ` · ${log.entity_id.slice(0, 8)}` : ""}
                      </td>
                      <td>{log.user_id ? log.user_id.slice(0, 8) : "—"}</td>
                      <td>{log.ip_address || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pager">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={page <= 1}
                  onClick={() => void refresh(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={page >= totalPages}
                  onClick={() => void refresh(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
