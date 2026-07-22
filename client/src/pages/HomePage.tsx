export function HomePage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>My files</h1>
          <p>Files and folders for your organization will appear here.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled title="Coming soon">
          New
        </button>
      </div>

      <div className="panel">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10z" />
            </svg>
          </div>
          <h2>No files yet</h2>
          <p>
            Upload and folder APIs come next. For now, manage your team from People if you’re an
            admin.
          </p>
        </div>
      </div>
    </>
  );
}
