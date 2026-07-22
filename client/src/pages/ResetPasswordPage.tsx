import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token.trim(), password);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      headline="Choose a new password."
      supporting="Use a strong password you haven’t used elsewhere."
    >
      <h2>Reset password</h2>
      <p className="subtitle">Paste your reset token and set a new password.</p>

      <form className="form-stack" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="token">Reset token</label>
          <input
            id="token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token from email or forgot-password response"
          />
        </div>

        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            autoComplete="new-password"
          />
          <span className="field-hint">
            8+ chars with upper, lower, number, and special character.
          </span>
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="auth-switch">
        Back to <Link to="/login">sign in</Link>
      </p>
    </AuthLayout>
  );
}
