import { useEffect, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import * as workspaceApi from "../api/workspace";
import { ContextMenu } from "../components/finder/ContextMenu";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  GearIcon,
  IconViewIcon,
  ListViewIcon,
  NewFolderIcon,
  ProjectIcon,
} from "../components/finder/icons";
import { useAuth } from "../context/AuthContext";
import type { Project } from "../types";
import { formatDate } from "../utils/format";

type ViewMode = "icons" | "list";

export function ProjectsPage() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const canWrite = user?.role === "admin" || user?.role === "member";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string | null } | null>(
    null,
  );

  async function refresh() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setProjects(await workspaceApi.listProjects(accessToken));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [accessToken]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await workspaceApi.createProject(accessToken, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setName("");
      setDescription("");
      setShowForm(false);
      setToast("Project created");
      await refresh();
      navigate(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(project: Project) {
    if (!accessToken || !canWrite) return;
    if (!window.confirm(`Delete project “${project.name}” and all of its folders?`)) return;
    try {
      await workspaceApi.deleteProject(accessToken, project.id);
      setToast(`Deleted ${project.name}`);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete project");
    }
  }

  function openContext(e: ReactMouseEvent, projectId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    if (projectId) setSelectedId(projectId);
    setContextMenu({ x: e.clientX, y: e.clientY, projectId });
  }

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="finder-browser" onContextMenu={(e) => openContext(e, null)}>
      <div className="finder-toolbar">
        <div className="finder-toolbar-nav">
          <button type="button" className="finder-tool-btn" disabled aria-label="Back">
            <ChevronLeftIcon size={16} />
          </button>
          <button type="button" className="finder-tool-btn" disabled aria-label="Forward">
            <ChevronRightIcon size={16} />
          </button>
        </div>

        <div className="finder-view-switch" role="group" aria-label="View mode">
          <button
            type="button"
            className={`finder-tool-btn${viewMode === "icons" ? " active" : ""}`}
            aria-pressed={viewMode === "icons"}
            aria-label="Icon view"
            onClick={() => setViewMode("icons")}
          >
            <IconViewIcon size={15} />
          </button>
          <button
            type="button"
            className={`finder-tool-btn${viewMode === "list" ? " active" : ""}`}
            aria-pressed={viewMode === "list"}
            aria-label="List view"
            onClick={() => setViewMode("list")}
          >
            <ListViewIcon size={15} />
          </button>
        </div>

        <div className="finder-toolbar-actions">
          {canWrite && (
            <button
              type="button"
              className="finder-tool-btn"
              title="New Project"
              aria-label="New Project"
              onClick={() => setShowForm(true)}
            >
              <NewFolderIcon size={16} />
            </button>
          )}
          <div className="finder-action-wrap">
            <button
              type="button"
              className={`finder-tool-btn${showActionMenu ? " active" : ""}`}
              aria-label="Actions"
              onClick={() => setShowActionMenu((v) => !v)}
            >
              <GearIcon size={15} />
            </button>
            {showActionMenu && (
              <div className="finder-action-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canWrite}
                  onClick={() => {
                    setShowForm(true);
                    setShowActionMenu(false);
                  }}
                >
                  New Project
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void refresh();
                    setShowActionMenu(false);
                  }}
                >
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="finder-toolbar-title">My Files</div>
      </div>

      {(error || toast) && (
        <div className={`finder-banner${error ? " error" : ""}`}>
          {error ?? toast}
          {error && (
            <button type="button" className="btn btn-ghost btn-compact" onClick={() => setError(null)}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <div className="finder-content">
        {loading ? (
          <div className="empty-state">
            <p>Loading…</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <ProjectIcon size={40} className="empty-state-icon" />
            <h2>No projects yet</h2>
            <p>{canWrite ? "Create a project to start organizing files." : "Ask an admin to create a project."}</p>
            {canWrite && (
              <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
                New Project
              </button>
            )}
          </div>
        ) : viewMode === "icons" ? (
          <div className="finder-icons">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`finder-icon-item${selectedId === project.id ? " selected" : ""}`}
                onClick={() => setSelectedId(project.id)}
                onDoubleClick={() => navigate(`/projects/${project.id}`)}
                onContextMenu={(e) => openContext(e, project.id)}
              >
                <FolderIcon size={48} className="finder-icon-glyph folder" />
                <span>{project.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="finder-list">
            <div className="finder-list-head">
              <span>Name</span>
              <span>Date Modified</span>
              <span>Size</span>
              <span>Kind</span>
            </div>
            {projects.map((project) => (
              <div
                key={project.id}
                className={`finder-list-row${selectedId === project.id ? " selected" : ""}`}
                onClick={() => setSelectedId(project.id)}
                onDoubleClick={() => navigate(`/projects/${project.id}`)}
                onContextMenu={(e) => openContext(e, project.id)}
              >
                <span className="finder-list-name">
                  <FolderIcon size={16} className="finder-row-icon folder" />
                  {project.name}
                </span>
                <span>{formatDate(project.updated_at)}</span>
                <span>—</span>
                <span>Project</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="finder-pathbar">
        <span className="finder-path-seg current">
          <FolderIcon size={13} className="side-folder-icon" />
          My Files
        </span>
      </div>

      <div className="finder-statusbar">
        <span>
          {loading
            ? "Loading…"
            : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
        </span>
        {selected && <span className="finder-status-sel">{selected.name}</span>}
      </div>

      {showForm && canWrite && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowForm(false)}>
          <div
            className="modal-panel modal-panel-sm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>New Project</h2>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => setShowForm(false)}>
                Close
              </button>
            </div>
            <form className="form-stack" onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="project-name">Name</label>
                <input
                  id="project-name"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Marketing assets"
                />
              </div>
              <div className="field">
                <label htmlFor="project-desc">Description</label>
                <input
                  id="project-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create"}
              </button>
            </form>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.projectId
              ? [
                  { id: "open", label: "Open" },
                  { id: "sep1", label: "", separator: true },
                  { id: "delete", label: "Delete…", danger: true, disabled: !canWrite },
                ]
              : [{ id: "new", label: "New Project", disabled: !canWrite }]
          }
          onClose={() => setContextMenu(null)}
          onSelect={(id) => {
            if (id === "new") setShowForm(true);
            if (id === "open" && contextMenu.projectId) navigate(`/projects/${contextMenu.projectId}`);
            if (id === "delete" && contextMenu.projectId) {
              const project = projects.find((p) => p.id === contextMenu.projectId);
              if (project) void handleDelete(project);
            }
          }}
        />
      )}
    </div>
  );
}
