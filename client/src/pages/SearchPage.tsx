import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { searchFiles } from "../api/ops";
import { useAuth } from "../context/AuthContext";
import type { FileTypeFilter, SearchFileResult } from "../types";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SearchPage() {
  const { accessToken } = useAuth();
  const [params, setParams] = useSearchParams();
  const initialQ = params.get("q") ?? "";

  const [q, setQ] = useState(initialQ);
  const [extension, setExtension] = useState("");
  const [tag, setTag] = useState("");
  const [fileType, setFileType] = useState<FileTypeFilter | "">("");
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(nextPage = 1, query = q) {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchFiles(accessToken, {
        q: query.trim() || undefined,
        extension: extension.trim() || undefined,
        tag: tag.trim() || undefined,
        fileType: fileType || undefined,
        page: nextPage,
        pageSize: 20,
      });
      setResults(data.items);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQ) void runSearch(1, initialQ);
  }, [accessToken]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setParams(q.trim() ? { q: q.trim() } : {});
    void runSearch(1, q);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p>Find files by name, extension, tags, or type across your organization.</p>
        </div>
      </div>

      <form className="form-card page-form search-form" onSubmit={handleSubmit}>
        <div className="form-stack">
          <div className="field">
            <label htmlFor="search-q">Filename</label>
            <input
              id="search-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="quarterly-report"
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="search-ext">Extension</label>
              <input
                id="search-ext"
                value={extension}
                onChange={(e) => setExtension(e.target.value)}
                placeholder="pdf"
              />
            </div>
            <div className="field">
              <label htmlFor="search-tag">Tag</label>
              <input
                id="search-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="finance"
              />
            </div>
            <div className="field">
              <label htmlFor="search-type">Type</label>
              <select
                id="search-type"
                value={fileType}
                onChange={(e) => setFileType(e.target.value as FileTypeFilter | "")}
              >
                <option value="">Any</option>
                <option value="image">Image</option>
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
                <option value="zip">ZIP / archive</option>
                <option value="document">Document</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {error && <div className="alert alert-error page-alert">{error}</div>}

      <div className="panel">
        <div className="toolbar">
          <strong style={{ fontSize: "0.9rem" }}>
            {total ? `${total} result${total === 1 ? "" : "s"}` : "Results"}
          </strong>
        </div>
        {loading ? (
          <div className="empty-state">
            <p>Searching…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <h2>No files found</h2>
            <p>Try another filename, tag, or type.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Ext</th>
                    <th>Tags</th>
                    <th>Size</th>
                    <th>Version</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((file) => (
                    <tr key={file.id}>
                      <td>{file.filename}</td>
                      <td>{file.extension || "—"}</td>
                      <td>
                        {file.tags?.length ? (
                          <span className="tag-list">
                            {file.tags.map((item) => (
                              <span key={item} className="tag-chip">
                                {item}
                              </span>
                            ))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{formatBytes(file.size)}</td>
                      <td>v{file.current_version}</td>
                      <td>
                        <Link
                          to={
                            file.folder_id
                              ? `/projects/${file.project_id}?folder=${file.folder_id}`
                              : `/projects/${file.project_id}`
                          }
                        >
                          Open
                        </Link>
                      </td>
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
                  onClick={() => void runSearch(page - 1)}
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
                  onClick={() => void runSearch(page + 1)}
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
