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
  const { listUsers, createUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
                  </tr>
                </thead>
                <tbody>
                  {users.map((person) => (
                    <tr key={person.id}>
                      <td>{person.name}</td>
                      <td>{person.email}</td>
                      <td>
                        <span className={`badge badge-${person.role}`}>
                          {person.role.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
