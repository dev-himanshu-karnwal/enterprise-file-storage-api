import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setResetToken(null);
    setSubmitting(true);
    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
      if (result.reset_token) {
        setResetToken(result.reset_token);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to request reset");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      headline="Reset access without leaving your team behind."
      supporting="We’ll help you set a new password so you can get back to your files."
    >
      <h2>Forgot password</h2>
      <p className="subtitle">Enter the email for your efs account.</p>

      <form className="form-stack" onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>

      {resetToken && (
        <div className="dev-token-box">
          <p>
            <strong>Dev mode:</strong> email isn’t configured yet. Use this token on the reset page.
          </p>
          <code>{resetToken}</code>
          <Link className="btn btn-secondary btn-block" to={`/reset-password?token=${resetToken}`}>
            Continue to reset password
          </Link>
        </div>
      )}

      <p className="auth-switch">
        Remembered it? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
