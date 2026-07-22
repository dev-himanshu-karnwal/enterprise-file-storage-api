import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Organization } from "../types";

function formatBytes(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function OrganizationPage() {
  const { listOrganizations, updateOrganization, isAdmin } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [storageGb, setStorageGb] = useState("10");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const orgs = await listOrganizations();
        const current = orgs[0] ?? null;
        setOrg(current);
        if (current) {
          setName(current.name);
          setStorageGb(String(current.storage_limit / (1024 * 1024 * 1024)));
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load organization");
      } finally {
        setLoading(false);
      }
    })();
  }, [listOrganizations]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!org || !isAdmin) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateOrganization(org.id, {
        name: name.trim(),
        storage_limit: Math.round(Number(storageGb) * 1024 * 1024 * 1024),
      });
      setOrg(updated);
      setSuccess("Organization updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update organization");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Organization</h1>
          <p>Workspace settings for your team.</p>
        </div>
      </div>

      <section className="form-card" style={{ maxWidth: 480 }}>
        {loading ? (
          <p className="subtitle">Loading organization…</p>
        ) : !org ? (
          <p className="subtitle">No organization found.</p>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="field">
              <label htmlFor="org-name">Name</label>
              <input
                id="org-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>

            <div className="field">
              <label htmlFor="org-slug">Slug</label>
              <input id="org-slug" value={org.slug} disabled />
            </div>

            <div className="field">
              <label htmlFor="org-storage">Storage limit (GB)</label>
              <input
                id="org-storage"
                type="number"
                min="1"
                step="1"
                required
                value={storageGb}
                onChange={(e) => setStorageGb(e.target.value)}
                disabled={!isAdmin}
              />
              <span className="field-hint">Current limit: {formatBytes(org.storage_limit)}</span>
            </div>

            {isAdmin ? (
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </button>
            ) : (
              <p className="field-hint">Only admins can edit organization settings.</p>
            )}
          </form>
        )}
      </section>
    </>
  );
}
