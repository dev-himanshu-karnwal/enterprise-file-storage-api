import type { ReactNode } from "react";

interface AuthLayoutProps {
  headline: string;
  supporting: string;
  children: ReactNode;
}

export function AuthLayout({ headline, supporting, children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <section className="auth-brand" aria-label="Product">
        <div className="auth-brand-top">
          <div className="brand-mark">efs</div>
          <div className="brand-wordmark">efs</div>
        </div>
        <div className="auth-brand-copy">
          <h1>{headline}</h1>
          <p>{supporting}</p>
        </div>
        <p className="auth-brand-meta">Enterprise File Storage</p>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <div className="brand-mark">efs</div>
          <div className="brand-wordmark">efs</div>
        </div>
        <div className="auth-panel-inner">{children}</div>
      </section>
    </div>
  );
}
