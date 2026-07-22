import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import * as workspaceApi from "../api/workspace";
import { useAuth } from "../context/AuthContext";
import type { Folder, Project } from "../types";

export function ProjectFoldersPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get("folder");
  const showTrash = searchParams.get("view") === "trash";

  const { accessToken, user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "member";

  const [project, setProject] = useState<Project | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const crumbLabel = useMemo(() => {
    if (showTrash) return "Trash";
    if (currentFolder) return currentFolder.path;
    return "Root";
  }, [showTrash, currentFolder]);

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
        setCurrentFolder(null);
        return;
      }

      if (showTrash) {
        setCurrentFolder(null);
        setFolders(await workspaceApi.listFolders(accessToken, projectId, null, true));
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
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load folders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [accessToken, projectId, folderId, showTrash]);

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

  async function handleDelete(folder: Folder) {
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

  async function handleRestore(folder: Folder) {
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
          <p>{showTrash ? "Soft-deleted folders in this project." : crumbLabel}</p>
        </div>
        <div className="header-actions">
          {!showTrash ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={openTrash}>
                Trash
              </button>
              {canWrite && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowCreate((value) => !value)}
                >
                  {showCreate ? "Cancel" : "New folder"}
                </button>
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
            <p>Loading folders…</p>
          </div>
        ) : folders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
            </div>
            <h2>{showTrash ? "Trash is empty" : "This folder is empty"}</h2>
            <p>
              {showTrash
                ? "Deleted folders will show up here."
                : canWrite
                  ? "Create a folder to organize upcoming files."
                  : "No folders here yet."}
            </p>
          </div>
        ) : (
          <div className="item-grid">
            {folders.map((folder) => (
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
                            onClick={() => void handleRestore(folder)}
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
                              onClick={() => void handleDelete(folder)}
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
          </div>
        )}
      </div>
    </>
  );
}
