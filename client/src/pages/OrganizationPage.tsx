import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Organization } from "../types";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

export function OrganizationPage() {
  const { listOrganizations, updateOrganization, isAdmin } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [storageGb, setStorageGb] = useState("10");
  const [contactEmail, setContactEmail] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyOrg(current: Organization) {
    setOrg(current);
    setName(current.name);
    setStorageGb(String(current.storage_limit / (1024 * 1024 * 1024)));
    const settings = current.settings ?? {};
    setContactEmail(typeof settings.contact_email === "string" ? settings.contact_email : "");
    setNotificationsEnabled(settings.notifications_enabled !== false);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const orgs = await listOrganizations();
        const current = orgs[0] ?? null;
        if (current) applyOrg(current);
        else setOrg(null);
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
        settings: {
          contact_email: contactEmail.trim() || null,
          notifications_enabled: notificationsEnabled,
        },
      });
      applyOrg(updated);
      setSuccess("Organization updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update organization");
    } finally {
      setSubmitting(false);
    }
  }

  const used = org?.storage_used ?? 0;
  const limit = org?.storage_limit ?? 1;
  const usagePct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Organization</h1>
          <p>Workspace settings and storage for your team.</p>
        </div>
      </div>

      <section className="form-card" style={{ maxWidth: 520 }}>
        {loading ? (
          <p className="subtitle">Loading organization…</p>
        ) : !org ? (
          <p className="subtitle">No organization found.</p>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="storage-meter" aria-label="Storage usage">
              <div className="storage-meter-head">
                <strong>Storage usage</strong>
                <span>
                  {formatBytes(used)} / {formatBytes(limit)} ({usagePct}%)
                </span>
              </div>
              <div className="storage-meter-track">
                <div className="storage-meter-fill" style={{ width: `${usagePct}%` }} />
              </div>
              <p className="field-hint">Includes trash until the 30-day retention purge.</p>
            </div>

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

            <div className="field">
              <label htmlFor="org-contact">Contact email</label>
              <input
                id="org-contact"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                disabled={!isAdmin}
                placeholder="admin@company.com"
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                disabled={!isAdmin}
              />
              <span>Enable organization notifications</span>
            </label>

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
