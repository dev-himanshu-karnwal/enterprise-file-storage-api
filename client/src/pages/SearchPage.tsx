import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { searchFiles } from "../api/ops";
import { FileIcon, SearchIcon } from "../components/finder/icons";
import { useAuth } from "../context/AuthContext";
import type { FileTypeFilter, SearchFileResult } from "../types";
import { formatBytes } from "../utils/format";

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
    <div className="finder-browser">
      <div className="finder-toolbar">
        <div className="finder-toolbar-actions">
          <SearchIcon size={16} />
        </div>
        <div className="finder-toolbar-title">Search</div>
      </div>

      <form className="finder-filters" onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="search-q">Filename</label>
            <input
              id="search-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="quarterly-report"
            />
          </div>
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
        <button className="btn btn-primary btn-compact" type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <div className="finder-banner error">{error}</div>}

      <div className="finder-content">
        {loading ? (
          <div className="empty-state">
            <p>Searching…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <SearchIcon size={36} className="empty-state-icon" />
            <h2>No files found</h2>
            <p>Try another filename, tag, or type.</p>
          </div>
        ) : (
          <div className="finder-list">
            <div className="finder-list-head">
              <span>Name</span>
              <span>Tags</span>
              <span>Size</span>
              <span>Kind</span>
            </div>
            {results.map((file) => (
              <Link
                key={file.id}
                className="finder-list-row"
                to={
                  file.folder_id
                    ? `/projects/${file.project_id}?folder=${file.folder_id}`
                    : `/projects/${file.project_id}`
                }
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span className="finder-list-name">
                  <FileIcon size={16} className="finder-row-icon file" />
                  {file.filename}
                </span>
                <span>{file.tags?.length ? file.tags.join(", ") : "—"}</span>
                <span>{formatBytes(file.size)}</span>
                <span>{file.extension ? file.extension.toUpperCase() : "File"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="finder-pathbar">
        <span className="finder-path-seg current">Search</span>
      </div>
      <div className="finder-statusbar">
        <span>
          {loading ? "Searching…" : `${total} result${total === 1 ? "" : "s"}`}
        </span>
        {totalPages > 1 && (
          <span className="pager">
            <button
              type="button"
              className="btn btn-ghost btn-compact"
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
              className="btn btn-ghost btn-compact"
              disabled={page >= totalPages}
              onClick={() => void runSearch(page + 1)}
            >
              Next
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
