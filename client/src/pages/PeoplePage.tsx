import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { User, UserRole } from "../types";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "read_only", label: "Read only" },
  { value: "admin", label: "Admin" },
];

export function PeoplePage() {
  const { user: currentUser, listUsers, createUser, updateUser, deleteUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("member");
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("member");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createUser({ name, email, password, role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      setSuccess("User created. They can sign in with the email and password you set.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(person: User) {
    setEditingId(person.id);
    setEditName(person.name);
    setEditRole(person.role);
    setError(null);
    setSuccess(null);
  }

  async function saveEdit(userId: string) {
    setRowBusy(userId);
    setError(null);
    setSuccess(null);
    try {
      await updateUser(userId, { name: editName.trim(), role: editRole });
      setEditingId(null);
      setSuccess("User updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user");
    } finally {
      setRowBusy(null);
    }
  }

  async function handleDelete(person: User) {
    if (person.id === currentUser?.id) return;
    const confirmed = window.confirm(`Remove ${person.name} from the organization?`);
    if (!confirmed) return;

    setRowBusy(person.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteUser(person.id);
      setSuccess(`${person.name} was removed.`);
      if (editingId === person.id) setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user");
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>People</h1>
          <p>Invite teammates to your organization. Admin only.</p>
        </div>
      </div>

      <div className="split-form">
        <section className="form-card">
          <h2>Add person</h2>
          <p className="subtitle">Creates a user in your organization with the selected role.</p>

          <form className="form-stack" onSubmit={handleCreate}>
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="field">
              <label htmlFor="person-name">Name</label>
              <input
                id="person-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jamie Chen"
              />
            </div>

            <div className="field">
              <label htmlFor="person-email">Email</label>
              <input
                id="person-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jamie@company.com"
              />
            </div>

            <div className="field">
              <label htmlFor="person-password">Temporary password</label>
              <input
                id="person-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Strong temporary password"
              />
            </div>

            <div className="field">
              <label htmlFor="person-role">Role</label>
              <select
                id="person-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add to organization"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="toolbar">
            <strong style={{ fontSize: "0.9rem" }}>Organization members</strong>
          </div>
          {loading ? (
            <div className="empty-state">
              <p>Loading people…</p>
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <h2>No people yet</h2>
              <p>Add the first teammate using the form.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((person) => {
                    const isEditing = editingId === person.id;
                    const busy = rowBusy === person.id;
                    return (
                      <tr key={person.id}>
                        <td>
                          {isEditing ? (
                            <input
                              className="inline-input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              aria-label="Edit name"
                            />
                          ) : (
                            person.name
                          )}
                        </td>
                        <td>{person.email}</td>
                        <td>
                          {isEditing ? (
                            <select
                              className="inline-input"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as UserRole)}
                              aria-label="Edit role"
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`badge badge-${person.role}`}>
                              {person.role.replace("_", " ")}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-compact"
                                  disabled={busy}
                                  onClick={() => void saveEdit(person.id)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-compact"
                                  disabled={busy}
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-compact"
                                  disabled={busy}
                                  onClick={() => startEdit(person)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-compact btn-danger-text"
                                  disabled={busy || person.id === currentUser?.id}
                                  onClick={() => void handleDelete(person)}
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
