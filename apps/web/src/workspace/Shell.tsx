import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Search,
  Menu,
  ChevronRight,
  ArrowUpRight,
  Bell,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { navigation, type Workspace } from "./navigation";
import { useSession } from "./session";
import { api, can } from "../lib/api";
import { ClyoraLogo } from "./ClyoraLogo";

export function Shell({ workspace }: { workspace: Workspace }) {
  const { user, signOut } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const items = navigation[workspace].filter(
    (i) => !i.permission || can(user, i.permission),
  );
  const current = items.find((i) => location.pathname.split("/")[2] === i.path);
  const tasks = useQuery({
    queryKey: ["task-alerts", user?.id],
    queryFn: () => api.tasks.list({ pageSize: 100 }),
    enabled: notifications && can(user, "task.read"),
  });
  const attention =
    tasks.data?.items.filter(
      (t) =>
        t.status !== "COMPLETED" &&
        t.status !== "SKIPPED" &&
        (t.isAtRisk || t.dueDate < new Date().toISOString().slice(0, 10)),
    ) ?? [];

  const workspaceTitle =
    workspace === "hr"
      ? "People operations"
      : workspace === "it_admin"
        ? "IT operations"
      : workspace === "manager"
        ? "Team workspace"
        : "My workspace";

  return (
    <div className={`workspace ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="command-bar">
        <Link
          className="brand"
          to={`/${workspace}/${workspace === "employee" ? "home" : "dashboard"}`}
          aria-label="CLYORA home"
        >
          <ClyoraLogo size="sm" compact={collapsed} />
        </Link>
        <span className="header-divider" />
        <span className="context-name">Intelligent Employee Onboarding</span>
        <form
          className="global-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(
              `/${workspace}/${workspace === "hr" || workspace === "it_admin" ? "employees" : workspace === "manager" ? "team" : "tasks"}?search=${encodeURIComponent(search)}`,
            );
          }}
        >
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search workspace"
            placeholder={
              workspace === "employee" ? "Search your tasks…" : "Search people…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <div className="header-actions">
          <Link
            className="icon-button"
            aria-label="Help"
            to={`/${workspace}/help`}
          >
            <CircleHelp size={19} />
          </Link>
          <button
            className={`icon-button ${notifications ? "selected" : ""}`}
            aria-label="Task alerts"
            aria-expanded={notifications}
            onClick={() => setNotifications(!notifications)}
          >
            <Bell size={19} />
            {attention.length > 0 && <i className="alert-dot" />}
          </button>
          <Link className="profile-chip" to={`/${workspace}/settings`}>
            <span className="avatar">
              {(user?.firstName ?? user?.email ?? "U").slice(0, 1).toUpperCase()}
            </span>
            <span>
              {[user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                user?.email}
              <small>
                {workspace === "hr"
                  ? "HR administrator"
                  : workspace === "it_admin"
                    ? "IT administrator"
                  : workspace === "manager"
                    ? "Manager"
                    : "Employee"}
              </small>
            </span>
          </Link>
          <button
            className="icon-button mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {notifications && (
        <aside className="notification-popover" aria-label="Task alerts">
          <h3>Needs your attention</h3>
          <p>
            Overdue and at-risk tasks from the first 100 accessible records.
          </p>
          {tasks.isPending ? (
            <p>Loading alerts…</p>
          ) : tasks.isError ? (
            <p role="alert">Unable to load task alerts.</p>
          ) : attention.length ? (
            attention.slice(0, 6).map((t) => (
              <Link
                onClick={() => setNotifications(false)}
                key={t.id}
                to={`/${workspace}/${workspace === "hr" ? "plans" : "onboarding"}/${t.planId}`}
              >
                {t.title}
                <ChevronRight size={16} />
              </Link>
            ))
          ) : (
            <p>No alerts in the loaded tasks.</p>
          )}
        </aside>
      )}

      {mobile && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}

      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Sparkles size={18} />
          </span>
          <span>
            {workspaceTitle}
            <small>CLYORA onboarding</small>
          </span>
        </div>
        <nav aria-label="Workspace navigation">
          {[...new Set(items.map((i) => i.group))].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-label">{group}</div>
              {items
                .filter((i) => i.group === group)
                .map((i) => (
                  <NavLink
                    key={i.path}
                    to={`/${workspace}/${i.path}`}
                    title={i.label}
                    onClick={() => setMobile(false)}
                    className={({ isActive }) =>
                      isActive ? "nav-link selected" : "nav-link"
                    }
                  >
                    <i.icon size={18} />
                    <span>{i.label}</span>
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span>{collapsed ? "Expand" : "Collapse"} navigation</span>
          </button>
          <button
            type="button"
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={() => {
              if (signingOut) return;
              setSigningOut(true);
              setError("");
              void signOut().catch((e: Error) => setError(e.message));
              navigate("/login?signedOut=1", { replace: true });
            }}
            title="Sign out"
          >
            {signingOut ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <LogOut size={18} />
            )}
            <span role={signingOut ? "status" : undefined}>
              {signingOut ? "Signing out…" : "Sign out"}
            </span>
          </button>
        </div>
      </aside>

      <main id="main" className="main-content">
        <div className="breadcrumb">
          <Link
            to={`/${workspace}/${workspace === "employee" ? "home" : "dashboard"}`}
          >
            Workspace
          </Link>
          <ChevronRight size={12} />
          <span>{current?.label ?? "Record details"}</span>
          {location.pathname.split("/").length > 3 && (
            <>
              <ChevronRight size={12} />
              <span>Details</span>
            </>
          )}
          <span className="breadcrumb-end">
            {new Intl.DateTimeFormat("en", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(new Date())}
          </span>
        </div>
        {error && (
          <p className="notice danger" role="alert">
            Sign out failed: {error}. Please try again.
          </p>
        )}
        <Outlet />
        <footer className="workspace-footer">
          <span>CLYORA · Intelligent Employee Onboarding</span>
          <Link to={`/${workspace}/help`}>
            Workspace guide <ArrowUpRight size={12} />
          </Link>
        </footer>
      </main>
    </div>
  );
}
