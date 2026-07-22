import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import * as workspaceApi from "../api/workspace";
import { useAuth } from "../context/AuthContext";
import type { Project } from "../types";

export function ProjectsPage() {
  const { accessToken, user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "member";

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

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

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceApi.createProject(accessToken, {
        name: name.trim(),
        description: description.trim() || null,
      });
      setName("");
      setDescription("");
      setShowForm(false);
      setSuccess("Project created.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(project: Project) {
    if (!accessToken || !canWrite) return;
    if (!window.confirm(`Delete project “${project.name}” and all of its folders?`)) return;
    setError(null);
    try {
      await workspaceApi.deleteProject(accessToken, project.id);
      setSuccess(`Deleted ${project.name}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete project");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My files</h1>
          <p>Projects organize folders for your organization.</p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Cancel" : "New project"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error page-alert">{error}</div>}
      {success && <div className="alert alert-success page-alert">{success}</div>}

      {showForm && canWrite && (
        <section className="form-card page-form">
          <h2>Create project</h2>
          <p className="subtitle">Give your team a place to store related folders.</p>
          <form className="form-stack" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="project-name">Name</label>
              <input
                id="project-name"
                required
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
              {submitting ? "Creating…" : "Create project"}
            </button>
          </form>
        </section>
      )}

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <p>Loading projects…</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10z" />
              </svg>
            </div>
            <h2>No projects yet</h2>
            <p>
              {canWrite
                ? "Create a project to start adding folders."
                : "Ask an admin or member to create a project."}
            </p>
          </div>
        ) : (
          <div className="item-grid">
            {projects.map((project) => (
              <article key={project.id} className="item-card">
                <Link to={`/projects/${project.id}`} className="item-card-main">
                  <span className="item-icon" aria-hidden>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
                    </svg>
                  </span>
                  <span className="item-copy">
                    <strong>{project.name}</strong>
                    <span>{project.description || "No description"}</span>
                  </span>
                </Link>
                {canWrite && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact btn-danger-text"
                    onClick={() => void handleDelete(project)}
                  >
                    Delete
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
