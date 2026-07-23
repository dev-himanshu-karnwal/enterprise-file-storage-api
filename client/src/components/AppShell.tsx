import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  AuditIcon,
  CloseIcon,
  FolderIcon,
  MenuIcon,
  OrgIcon,
  PeopleIcon,
  SearchIcon,
  TrashIcon,
} from "./finder/icons";

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
  const [searchQ, setSearchQ] = useState("");

  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const inProject = Boolean(projectId);
  const trashActive = inProject && new URLSearchParams(location.search).get("view") === "trash";

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

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
    <div className={`finder-app${navOpen ? " nav-open" : ""}`}>
      <div className="finder-window">
        <header className="finder-titlebar">
          <div className="finder-traffic" aria-hidden>
            <span className="traffic traffic-close" />
            <span className="traffic traffic-min" />
            <span className="traffic traffic-max" />
          </div>
          <button
            type="button"
            className="icon-btn menu-toggle"
            aria-label="Open sidebar"
            aria-expanded={navOpen}
            aria-controls="finder-sidebar"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon size={18} />
          </button>
          <div className="finder-titlebar-label">efs</div>
          <form
            className="finder-search"
            onSubmit={(event) => {
              event.preventDefault();
              const q = searchQ.trim();
              navigate(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
            }}
          >
            <SearchIcon size={14} />
            <input
              type="search"
              placeholder="Search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              aria-label="Search files"
            />
          </form>
        </header>

        <div className="finder-body">
          <button
            type="button"
            className="nav-backdrop"
            aria-label="Close sidebar"
            tabIndex={navOpen ? 0 : -1}
            onClick={() => setNavOpen(false)}
          />

          <aside className="finder-sidebar" id="finder-sidebar">
            <div className="sidebar-mobile-head">
              <span className="brand-wordmark">efs</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close sidebar"
                onClick={() => setNavOpen(false)}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="finder-sidebar-group">
              <p className="finder-sidebar-label">Favorites</p>
              <NavLink to="/" end className={({ isActive }) => `finder-side-item${isActive ? " active" : ""}`}>
                <FolderIcon size={16} className="side-folder-icon" />
                My Files
              </NavLink>
              {inProject && projectId && (
                <NavLink
                  to={`/projects/${projectId}?view=trash`}
                  className={() => `finder-side-item${trashActive ? " active" : ""}`}
                >
                  <TrashIcon size={16} />
                  Trash
                </NavLink>
              )}
            </div>

            <div className="finder-sidebar-group">
              <p className="finder-sidebar-label">Workspace</p>
              <NavLink
                to="/organization"
                className={({ isActive }) => `finder-side-item${isActive ? " active" : ""}`}
              >
                <OrgIcon size={16} />
                Organization
              </NavLink>
              {isAdmin && (
                <NavLink
                  to="/people"
                  className={({ isActive }) => `finder-side-item${isActive ? " active" : ""}`}
                >
                  <PeopleIcon size={16} />
                  People
                </NavLink>
              )}
              {isAdmin && (
                <NavLink
                  to="/audit-logs"
                  className={({ isActive }) => `finder-side-item${isActive ? " active" : ""}`}
                >
                  <AuditIcon size={16} />
                  Audit Logs
                </NavLink>
              )}
            </div>

            <div className="finder-sidebar-footer">
              <div className="user-chip">
                <div className="avatar" aria-hidden>
                  {initials(user.name)}
                </div>
                <div className="user-meta">
                  <strong>{user.name}</strong>
                  <span>{user.role.replace("_", " ")}</span>
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-compact btn-block" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </aside>

          <main className="finder-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
