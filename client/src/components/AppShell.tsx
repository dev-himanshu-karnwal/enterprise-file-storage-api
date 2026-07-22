import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function OrgIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  async function handleLogout() {
    setNavOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  if (!user) return null;

  return (
    <div className={`app-shell${navOpen ? " nav-open" : ""}`}>
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">efs</div>
          <div className="brand-wordmark">efs</div>
          <button
            type="button"
            className="icon-btn sidebar-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="nav-section" aria-label="Primary">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            <span className="nav-icon">
              <FolderIcon />
            </span>
            My files
          </NavLink>
          <NavLink
            to="/organization"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <span className="nav-icon">
              <OrgIcon />
            </span>
            Organization
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/people"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">
                <PeopleIcon />
              </span>
              People
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar" aria-hidden>
              {initials(user.name)}
            </div>
            <div className="user-meta">
              <strong>{user.name}</strong>
              <span>{user.role.replace("_", " ")}</span>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-block sidebar-signout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button
          type="button"
          className="icon-btn menu-toggle"
          aria-label="Open menu"
          aria-expanded={navOpen}
          aria-controls="app-sidebar"
          onClick={() => setNavOpen(true)}
        >
          <MenuIcon />
        </button>

        <div className="topbar-brand" aria-hidden>
          <div className="brand-mark brand-mark-sm">efs</div>
          <span className="brand-wordmark brand-wordmark-sm">efs</span>
        </div>

        <label className="search-box">
          <SearchIcon />
          <span className="sr-only">Search</span>
          <input type="search" placeholder="Search files" disabled />
        </label>

        <div className="topbar-actions">
          <button type="button" className="btn btn-ghost topbar-signout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
