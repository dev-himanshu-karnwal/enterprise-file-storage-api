import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import * as filesApi from "../api/files";
import * as workspaceApi from "../api/workspace";
import { useAuth } from "../context/AuthContext";
import type { FileTypeFilter, FileVersion, Folder, Project, StoredFile } from "../types";

const ACCEPT_UPLOAD =
  "image/*,.pdf,video/*,.zip,.7z,.gz,.tar,.txt,.csv,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.ods";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function ProjectFoldersPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get("folder");
  const showTrash = searchParams.get("view") === "trash";

  const { accessToken, user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "member";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadTags, setUploadTags] = useState("");
  const [versionsFor, setVersionsFor] = useState<StoredFile | null>(null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [movingFile, setMovingFile] = useState<StoredFile | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [editingTagsFile, setEditingTagsFile] = useState<StoredFile | null>(null);
  const [tagsDraft, setTagsDraft] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<FileTypeFilter | "">("");
  const [filterTag, setFilterTag] = useState("");
  const [filterAfter, setFilterAfter] = useState("");
  const [filterBefore, setFilterBefore] = useState("");
  const [filterSizeMinMb, setFilterSizeMinMb] = useState("");
  const [filterSizeMaxMb, setFilterSizeMaxMb] = useState("");

  const crumbLabel = useMemo(() => {
    if (showTrash) return "Trash";
    if (currentFolder) return currentFolder.path;
    return "Root";
  }, [showTrash, currentFolder]);

  const hasActiveFilters = Boolean(
    filterType || filterTag || filterAfter || filterBefore || filterSizeMinMb || filterSizeMaxMb,
  );

  async function refresh() {
    if (!accessToken || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const projects = await workspaceApi.listProjects(accessToken);
      const found = projects.find((item) => item.id === projectId) ?? null;
      setProject(found);
      if (!found) {
        setFolders([]);
        setFiles([]);
        setCurrentFolder(null);
        setAllFolders([]);
        return;
      }

      setAllFolders(await workspaceApi.listFolders(accessToken, projectId, null, false, true));

      const filters = {
        fileType: filterType || undefined,
        tag: filterTag.trim() || undefined,
        uploadedAfter: filterAfter ? new Date(filterAfter).toISOString() : undefined,
        uploadedBefore: filterBefore
          ? new Date(`${filterBefore}T23:59:59`).toISOString()
          : undefined,
        sizeMin: filterSizeMinMb ? Math.round(Number(filterSizeMinMb) * 1024 * 1024) : undefined,
        sizeMax: filterSizeMaxMb ? Math.round(Number(filterSizeMaxMb) * 1024 * 1024) : undefined,
        filterMode: hasActiveFilters,
      };

      if (showTrash) {
        setCurrentFolder(null);
        setFolders(await workspaceApi.listFolders(accessToken, projectId, null, true));
        setFiles(await filesApi.listFiles(accessToken, projectId, null, true, filters));
      } else {
        let parent: Folder | null = null;
        if (folderId) {
          parent = await workspaceApi.getFolder(accessToken, folderId);
          setCurrentFolder(parent);
        } else {
          setCurrentFolder(null);
        }
        setFolders(
          await workspaceApi.listFolders(accessToken, projectId, parent?.id ?? null, false),
        );
        setFiles(
          await filesApi.listFiles(
            accessToken,
            projectId,
            hasActiveFilters ? parent?.id ?? undefined : parent?.id ?? null,
            false,
            filters,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [
    accessToken,
    projectId,
    folderId,
    showTrash,
    filterType,
    filterTag,
    filterAfter,
    filterBefore,
    filterSizeMinMb,
    filterSizeMaxMb,
  ]);

  function openFolder(id: string | null) {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    if (id) next.set("folder", id);
    else next.delete("folder");
    setSearchParams(next);
  }

  function openTrash() {
    setSearchParams({ view: "trash" });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceApi.createFolder(accessToken, {
        project_id: projectId,
        name: folderName.trim(),
        parent_folder_id: folderId,
      });
      setFolderName("");
      setShowCreate(false);
      setSuccess("Folder created.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create folder");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(folder: Folder) {
    if (!accessToken || !canWrite || !renameValue.trim()) return;
    setError(null);
    try {
      await workspaceApi.updateFolder(accessToken, folder.id, { name: renameValue.trim() });
      setRenamingId(null);
      setSuccess("Folder renamed.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename folder");
    }
  }

  async function handleDeleteFolder(folder: Folder) {
    if (!accessToken || !canWrite) return;
    if (!window.confirm(`Move “${folder.name}” to trash?`)) return;
    setError(null);
    try {
      await workspaceApi.deleteFolder(accessToken, folder.id);
      setSuccess("Folder moved to trash.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete folder");
    }
  }

  async function handleRestoreFolder(folder: Folder) {
    if (!accessToken || !canWrite) return;
    setError(null);
    try {
      await workspaceApi.restoreFolder(accessToken, folder.id);
      setSuccess(`Restored ${folder.name}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore folder");
    }
  }

  async function handleUpload(selected: FileList | null) {
    if (!accessToken || !canWrite || !selected?.length) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const tags = parseTags(uploadTags);
      for (const file of Array.from(selected)) {
        await filesApi.uploadFile(accessToken, {
          projectId,
          folderId,
          file,
          tags,
        });
      }
      setSuccess(selected.length === 1 ? "File uploaded." : `${selected.length} files uploaded.`);
      setUploadTags("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed — check S3 config");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(file: StoredFile, version?: number) {
    if (!accessToken) return;
    setError(null);
    try {
      const info = await filesApi.getDownload(accessToken, file.id, version);
      window.open(info.download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed");
    }
  }

  async function handleDeleteFile(file: StoredFile) {
    if (!accessToken || !canWrite) return;
    if (!window.confirm(`Move “${file.filename}” to trash?`)) return;
    setError(null);
    try {
      await filesApi.deleteFile(accessToken, file.id);
      setSuccess("File moved to trash.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete file");
    }
  }

  async function handleRestoreFile(file: StoredFile) {
    if (!accessToken || !canWrite) return;
    setError(null);
    try {
      await filesApi.restoreFile(accessToken, file.id);
      setSuccess(`Restored ${file.filename}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore file");
    }
  }

  async function handleMoveFile() {
    if (!accessToken || !canWrite || !movingFile) return;
    setError(null);
    try {
      await filesApi.updateFile(accessToken, movingFile.id, {
        folder_id: moveTarget || null,
      });
      setSuccess(`Moved ${movingFile.filename}.`);
      setMovingFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move file");
    }
  }

  async function handleSaveTags() {
    if (!accessToken || !canWrite || !editingTagsFile) return;
    setError(null);
    try {
      await filesApi.updateFile(accessToken, editingTagsFile.id, {
        tags: parseTags(tagsDraft),
      });
      setSuccess(`Updated tags for ${editingTagsFile.filename}.`);
      setEditingTagsFile(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update tags");
    }
  }

  async function openVersions(file: StoredFile) {
    if (!accessToken) return;
    setVersionsFor(file);
    setVersionsLoading(true);
    setError(null);
    try {
      setVersions(await filesApi.listVersions(accessToken, file.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load versions");
      setVersionsFor(null);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleRestoreVersion(version: number) {
    if (!accessToken || !canWrite || !versionsFor) return;
    setError(null);
    try {
      await filesApi.restoreVersion(accessToken, versionsFor.id, version);
      setSuccess(`Restored ${versionsFor.filename} to version ${version}.`);
      setVersionsFor(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore version");
    }
  }

  function clearFilters() {
    setFilterType("");
    setFilterTag("");
    setFilterAfter("");
    setFilterBefore("");
    setFilterSizeMinMb("");
    setFilterSizeMaxMb("");
  }

  if (!loading && !project) {
    return (
      <div className="empty-state">
        <h2>Project not found</h2>
        <p>
          <Link to="/">Back to projects</Link>
        </p>
      </div>
    );
  }

  const isEmpty = !loading && folders.length === 0 && files.length === 0;

  return (
    <>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">My files</Link>
            <span aria-hidden> / </span>
            <span>{project?.name ?? "…"}</span>
            {!showTrash && currentFolder && (
              <>
                <span aria-hidden> / </span>
                <button type="button" className="linkish" onClick={() => openFolder(null)}>
                  Root
                </button>
                <span aria-hidden> / </span>
                <span>{currentFolder.name}</span>
              </>
            )}
            {showTrash && (
              <>
                <span aria-hidden> / </span>
                <span>Trash</span>
              </>
            )}
          </p>
          <h1>{showTrash ? "Trash" : project?.name}</h1>
          <p>{showTrash ? "Soft-deleted folders and files." : crumbLabel}</p>
        </div>
        <div className="header-actions">
          {!showTrash ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowFilters((value) => !value)}
              >
                {showFilters || hasActiveFilters ? "Filters" : "Filter"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={openTrash}>
                Trash
              </button>
              {canWrite && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreate((value) => !value)}
                  >
                    {showCreate ? "Cancel" : "New folder"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    accept={ACCEPT_UPLOAD}
                    onChange={(e) => void handleUpload(e.target.files)}
                  />
                </>
              )}
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => openFolder(null)}>
              Back to folders
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error page-alert">{error}</div>}
      {success && <div className="alert alert-success page-alert">{success}</div>}

      {canWrite && !showTrash && (
        <div className="field upload-tags-field">
          <label htmlFor="upload-tags">Tags for next upload (comma-separated)</label>
          <input
            id="upload-tags"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.target.value)}
            placeholder="finance, q3"
          />
        </div>
      )}

      {showFilters && !showTrash && (
        <section className="form-card page-form filter-panel">
          <div className="field-row">
            <div className="field">
              <label htmlFor="filter-type">Type</label>
              <select
                id="filter-type"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as FileTypeFilter | "")}
              >
                <option value="">Any</option>
                <option value="image">Image</option>
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
                <option value="zip">ZIP / archive</option>
                <option value="document">Document</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-tag">Tag</label>
              <input
                id="filter-tag"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                placeholder="finance"
              />
            </div>
            <div className="field">
              <label htmlFor="filter-after">Uploaded after</label>
              <input
                id="filter-after"
                type="date"
                value={filterAfter}
                onChange={(e) => setFilterAfter(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="filter-before">Uploaded before</label>
              <input
                id="filter-before"
                type="date"
                value={filterBefore}
                onChange={(e) => setFilterBefore(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="filter-size-min">Min size (MB)</label>
              <input
                id="filter-size-min"
                type="number"
                min="0"
                step="0.1"
                value={filterSizeMinMb}
                onChange={(e) => setFilterSizeMinMb(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="filter-size-max">Max size (MB)</label>
              <input
                id="filter-size-max"
                type="number"
                min="0"
                step="0.1"
                value={filterSizeMaxMb}
                onChange={(e) => setFilterSizeMaxMb(e.target.value)}
              />
            </div>
          </div>
          {hasActiveFilters && (
            <button type="button" className="btn btn-ghost btn-compact" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </section>
      )}

      {showCreate && canWrite && !showTrash && (
        <section className="form-card page-form">
          <h2>New folder</h2>
          <form className="form-stack" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="folder-name">Name</label>
              <input
                id="folder-name"
                required
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Q3 campaigns"
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create folder"}
            </button>
          </form>
        </section>
      )}

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <p>Loading…</p>
          </div>
        ) : isEmpty ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
            </div>
            <h2>{showTrash ? "Trash is empty" : "This folder is empty"}</h2>
            <p>
              {showTrash
                ? "Deleted items will show up here."
                : canWrite
                  ? "Upload files or create a folder to get started."
                  : "Nothing here yet."}
            </p>
          </div>
        ) : (
          <div className="item-grid">
            {!hasActiveFilters &&
              folders.map((folder) => (
                <article key={folder.id} className="item-card">
                  {renamingId === folder.id ? (
                    <div className="item-card-main item-card-edit">
                      <input
                        className="inline-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        aria-label="Rename folder"
                      />
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-compact"
                          onClick={() => void handleRename(folder)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-compact"
                          onClick={() => setRenamingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="item-card-main linkish-block"
                        onClick={() => !showTrash && openFolder(folder.id)}
                        disabled={showTrash}
                      >
                        <span className="item-icon" aria-hidden>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                          </svg>
                        </span>
                        <span className="item-copy">
                          <strong>{folder.name}</strong>
                          <span>{folder.path}</span>
                        </span>
                      </button>
                      {canWrite && (
                        <div className="row-actions">
                          {showTrash ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-compact"
                              onClick={() => void handleRestoreFolder(folder)}
                            >
                              Restore
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => {
                                  setRenamingId(folder.id);
                                  setRenameValue(folder.name);
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-compact btn-danger-text"
                                onClick={() => void handleDeleteFolder(folder)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}

            {files.map((file) => (
              <article key={file.id} className="item-card">
                <div className="item-card-main">
                  <span className="item-icon item-icon-file" aria-hidden>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                    </svg>
                  </span>
                  <span className="item-copy">
                    <strong>{file.filename}</strong>
                    <span>
                      v{file.current_version} · {formatBytes(file.size)}
                      {file.extension ? ` · .${file.extension}` : ""}
                    </span>
                    {file.tags?.length > 0 && (
                      <span className="tag-list">
                        {file.tags.map((tag) => (
                          <span key={tag} className="tag-chip">
                            {tag}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </div>
                <div className="row-actions">
                  {showTrash ? (
                    canWrite && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => void handleRestoreFile(file)}
                      >
                        Restore
                      </button>
                    )
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => void handleDownload(file)}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => void openVersions(file)}
                      >
                        Versions
                      </button>
                      {canWrite && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact"
                            onClick={() => {
                              setMovingFile(file);
                              setMoveTarget(file.folder_id ?? "");
                            }}
                          >
                            Move
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact"
                            onClick={() => {
                              setEditingTagsFile(file);
                              setTagsDraft((file.tags ?? []).join(", "));
                            }}
                          >
                            Tags
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact btn-danger-text"
                            onClick={() => void handleDeleteFile(file)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {versionsFor && (
        <div className="modal-backdrop" role="presentation" onClick={() => setVersionsFor(null)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="versions-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="versions-title">Versions — {versionsFor.filename}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setVersionsFor(null)}
              >
                Close
              </button>
            </div>
            {versionsLoading ? (
              <p className="subtitle">Loading versions…</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Size</th>
                      <th>Uploaded</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((version) => (
                      <tr key={version.id}>
                        <td>
                          v{version.version}
                          {version.version === versionsFor.current_version ? " (current)" : ""}
                        </td>
                        <td>{formatBytes(version.size)}</td>
                        <td>{new Date(version.created_at).toLocaleString()}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-compact"
                              onClick={() => void handleDownload(versionsFor, version.version)}
                            >
                              Download
                            </button>
                            {canWrite && version.version !== versionsFor.current_version && (
                              <button
                                type="button"
                                className="btn btn-primary btn-compact"
                                onClick={() => void handleRestoreVersion(version.version)}
                              >
                                Make current
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {movingFile && (
        <div className="modal-backdrop" role="presentation" onClick={() => setMovingFile(null)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="move-title">Move — {movingFile.filename}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setMovingFile(null)}
              >
                Close
              </button>
            </div>
            <div className="form-stack">
              <div className="field">
                <label htmlFor="move-folder">Destination folder</label>
                <select
                  id="move-folder"
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                >
                  <option value="">Project root</option>
                  {allFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void handleMoveFile()}>
                Move file
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTagsFile && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setEditingTagsFile(null)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tags-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="tags-title">Tags — {editingTagsFile.filename}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setEditingTagsFile(null)}
              >
                Close
              </button>
            </div>
            <div className="form-stack">
              <div className="field">
                <label htmlFor="edit-tags">Comma-separated tags</label>
                <input
                  id="edit-tags"
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  placeholder="finance, q3"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveTags()}>
                Save tags
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
