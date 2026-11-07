import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Users,
  Eye,
  EyeOff,
  UserRound,
  FileText,
  Laptop,
  Wallet,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Workflow,
  Network,
  ChartNoAxesCombined,
  ArrowUpRight,
} from "lucide-react";
import { useSession, homeFor } from "./session";
import { ClyoraLogo } from "./ClyoraLogo";
import { ApiError, api } from "../lib/api";

const BrandMark = ClyoraLogo;

function JourneyVisual() {
  const stages = [
    { label: "Profile", done: true },
    { label: "Documents", done: true },
    { label: "IT setup", done: false, active: true },
    { label: "Payroll", done: false },
    { label: "Training", done: false },
    { label: "Ready", done: false },
  ];
  return (
    <div className="auth-journey" aria-hidden="true">
      <div className="auth-journey-card">
        <div className="auth-journey-head">
          <span className="auth-journey-live">Live journey</span>
          <strong>New hire readiness</strong>
        </div>
        <div className="auth-journey-track">
          {stages.map((s, i) => (
            <div
              key={s.label}
              className={`auth-journey-step ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}
            >
              <span className="auth-journey-dot">
                {s.done ? <Check size={12} /> : i + 1}
              </span>
              <small>{s.label}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuthBrandPanel() {
  return (
    <aside className="auth-brand-panel">
      <div className="auth-brand-panel-inner">
        <Link to="/" className="auth-brand-home">
          <BrandMark size="lg" />
        </Link>
        <p className="auth-product-descriptor">Intelligent Employee Onboarding</p>
        <h1 className="auth-brand-headline">A better beginning starts here.</h1>
        <p className="auth-brand-copy">
          CLYORA connects HR, managers, IT, finance and new hires into one clear
          onboarding journey — so every employee arrives ready for day one.
        </p>
        <JourneyVisual />
        <ul className="auth-feature-list">
          <li>
            <Sparkles size={16} />
            <div>
              <strong>Smarter onboarding</strong>
              <span>Policy-aware plans generated and reviewed before work begins.</span>
            </div>
          </li>
          <li>
            <Network size={16} />
            <div>
              <strong>Connected teams</strong>
              <span>Documents, equipment, payroll and training in one workflow.</span>
            </div>
          </li>
          <li>
            <ChartNoAxesCombined size={16} />
            <div>
              <strong>Clear progress</strong>
              <span>Everyone sees what is done, blocked, and due next.</span>
            </div>
          </li>
        </ul>
        <p className="auth-brand-tagline">
          Every employee journey, seamlessly connected.
        </p>
      </div>
    </aside>
  );
}

export function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-navbar">
        <div className="landing-nav-inner">
          <Link className="landing-brand-wrap" to="/">
            <BrandMark />
            <span className="landing-brand-pill">Intelligent Onboarding</span>
          </Link>
          <nav className="landing-nav-links" aria-label="Product">
            <a href="#platform" className="landing-nav-link">
              Platform
            </a>
            <a href="#roles" className="landing-nav-link">
              Workspaces
            </a>
            <a href="#journey" className="landing-nav-link">
              Journey
            </a>
          </nav>
          <div className="landing-nav-actions">
            <Link className="landing-btn-login" to="/login">
              Sign in
            </Link>
            <Link className="landing-btn-signup" to="/login">
              HR sign in
              <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero-section">
          <div className="landing-hero-inner">
            <p className="landing-hero-eyebrow">
              <Sparkles size={14} />
              CLYORA · Intelligent Employee Onboarding
            </p>
            <h1 className="landing-hero-title">
              Every employee journey,{" "}
              <span className="landing-hero-title-highlight">seamlessly connected.</span>
            </h1>
            <p className="landing-hero-subtitle">
              From profile creation to day-one readiness, CLYORA coordinates
              documents, IT, payroll, training and manager actions in one calm,
              enterprise-grade workspace.
            </p>
            <div className="landing-hero-cta-row">
              <Link className="landing-cta-primary" to="/login">
                Enter workspace
                <ArrowRight size={16} />
              </Link>
              <a className="landing-cta-secondary" href="#roles">
                <Users size={16} />
                Explore role experiences
              </a>
            </div>
            <div className="landing-demo-bar">
              <span className="landing-demo-label">Try a demo role</span>
              <Link
                className="landing-demo-pill"
                to="/login"
                state={{ defaultRole: "HR Administrator" }}
              >
                <ShieldCheck size={14} />
                HR Admin
              </Link>
              <Link
                className="landing-demo-pill"
                to="/login"
                state={{ defaultRole: "Manager" }}
              >
                <Users size={14} />
                Manager
              </Link>
              <Link
                className="landing-demo-pill"
                to="/login"
                state={{ defaultRole: "New Employee" }}
              >
                <UserRound size={14} />
                Employee
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-features-section" id="platform">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Platform</p>
            <h2 className="landing-section-title">
              Built for the full onboarding lifecycle
            </h2>
            <p className="landing-section-sub">
              Real workflows backed by your organization’s permissions, plans and
              task data — not a decorative dashboard.
            </p>
          </div>
          <div className="landing-features-grid">
            {[
              {
                icon: Workflow,
                title: "Intelligent plans",
                text: "Generate, review and approve onboarding plans with clear ownership and dependencies.",
              },
              {
                icon: FileText,
                title: "Document collection",
                text: "Request, upload and verify documents with status that employees and HR can both trust.",
              },
              {
                icon: Laptop,
                title: "Equipment & IT",
                text: "Track allocation status from request through delivery without leaving the journey.",
              },
              {
                icon: Wallet,
                title: "Payroll & benefits",
                text: "Coordinate sensitive setup steps with role-aware access and verification states.",
              },
              {
                icon: GraduationCap,
                title: "Training progress",
                text: "Assign mandatory learning and show employees exactly what to complete next.",
              },
              {
                icon: Users,
                title: "Manager readiness",
                text: "Give managers a focused view of team joins, approvals and welcome actions.",
              },
            ].map((f) => (
              <article className="landing-feature-card" key={f.title}>
                <div className="landing-feature-icon-wrap">
                  <f.icon size={18} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-roles-section" id="roles">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Workspaces</p>
            <h2 className="landing-section-title">Designed around real responsibilities</h2>
            <p className="landing-section-sub">
              Navigation and data access follow your RBAC permissions — HR, managers
              and employees each get an experience shaped for their work.
            </p>
          </div>
          <div className="landing-roles-grid">
            <article className="landing-role-card">
              <span className="landing-role-badge">HR</span>
              <h3>People operations</h3>
              <p>
                Create employees, generate plans, approve journeys, verify documents
                and monitor overdue work across the organization.
              </p>
              <ul className="landing-role-checklist">
                <li>
                  <Check size={14} /> Directory & intake
                </li>
                <li>
                  <Check size={14} /> Plan approval
                </li>
                <li>
                  <Check size={14} /> Cross-service queue
                </li>
              </ul>
              <Link className="landing-role-btn" to="/login" state={{ defaultRole: "HR Administrator" }}>
                Sign in as HR <ArrowRight size={14} />
              </Link>
            </article>
            <article className="landing-role-card">
              <span className="landing-role-badge">Manager</span>
              <h3>Team onboarding</h3>
              <p>
                Stay ahead of joining dates, complete manager tasks and keep new
                teammates unblocked without HR-only data exposure.
              </p>
              <ul className="landing-role-checklist">
                <li>
                  <Check size={14} /> Team overview
                </li>
                <li>
                  <Check size={14} /> Manager tasks
                </li>
                <li>
                  <Check size={14} /> Progress visibility
                </li>
              </ul>
              <Link className="landing-role-btn" to="/login" state={{ defaultRole: "Manager" }}>
                Sign in as manager <ArrowRight size={14} />
              </Link>
            </article>
            <article className="landing-role-card">
              <span className="landing-role-badge">Employee</span>
              <h3>Personal journey</h3>
              <p>
                A clear path for new hires: tasks, documents, training and progress —
                with one obvious next step at every moment.
              </p>
              <ul className="landing-role-checklist">
                <li>
                  <Check size={14} /> My tasks
                </li>
                <li>
                  <Check size={14} /> Document upload
                </li>
                <li>
                  <Check size={14} /> Learning checklist
                </li>
              </ul>
              <Link className="landing-role-btn" to="/login" state={{ defaultRole: "New Employee" }}>
                Sign in as employee <ArrowRight size={14} />
              </Link>
            </article>
          </div>
        </section>

        <section className="landing-features-section" id="journey">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Journey</p>
            <h2 className="landing-section-title">From hire to ready — without the chase</h2>
            <p className="landing-section-sub">
              CLYORA keeps stakeholders aligned on the same plan, statuses and
              deadlines so onboarding stops living in inboxes.
            </p>
          </div>
          <div className="landing-pipeline-grid landing-pipeline-grid-wide">
            {[
              ["01", "Employee created"],
              ["02", "Documents collected"],
              ["03", "IT & equipment"],
              ["04", "Payroll & benefits"],
              ["05", "Training assigned"],
              ["06", "Manager complete"],
            ].map(([n, label]) => (
              <div className="landing-pipe-item" key={n}>
                <div className="landing-pipe-header">
                  <div className="landing-pipe-icon blue">{n}</div>
                </div>
                <h4 className="landing-pipe-title">{label}</h4>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-cta-banner-section">
          <div className="landing-cta-banner-inner">
            <div>
              <h2>Ready to welcome your next hire with clarity?</h2>
              <p>
                Sign in to your CLYORA workspace and continue where your team left
                off.
              </p>
            </div>
            <div className="landing-banner-btns">
              <Link className="landing-banner-primary" to="/login">
                Sign in
              </Link>
              <Link className="landing-banner-secondary" to="/login">
                HR sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <BrandMark size="sm" />
            <p>Intelligent Employee Onboarding</p>
          </div>
          <div className="landing-footer-bottom">
            <span>© {new Date().getFullYear()} CLYORA. All rights reserved.</span>
            <span>Every employee journey, seamlessly connected.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

type DemoRole = "HR Administrator" | "New Employee" | "Manager";

const demoAccounts: Record<DemoRole, { email: string; password: string }> = {
  "HR Administrator": {
    email: "hr.admin@demo.io",
    password: "Onboard!ng2026",
  },
  Manager: { email: "manager@demo.io", password: "Onboard!ng2026" },
  "New Employee": {
    email: "priya@demo.io",
    password: "Onboard!ng2026",
  },
};

export function Login() {
  const { signIn, error: sessionError } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const stateRole = (location.state as { defaultRole?: string } | null)?.defaultRole;
  const initialRole: DemoRole =
    stateRole === "Manager"
      ? "Manager"
      : stateRole === "New Employee"
        ? "New Employee"
        : "HR Administrator";
  const [role, setRole] = useState<DemoRole>(initialRole);
  const [email, setEmail] = useState(demoAccounts[initialRole].email);
  const [password, setPassword] = useState(demoAccounts[initialRole].password);
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleRoleChange = (next: DemoRole) => {
    setRole(next);
    setError("");
    setEmail(demoAccounts[next].email);
    setPassword(demoAccounts[next].password);
  };

  async function submit(e?: FormEvent) {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await signIn(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(
        from?.startsWith("/") && !from.startsWith("//") ? from : homeFor(u),
        { replace: true },
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split-container">
      <AuthBrandPanel />
      <div className="auth-right-panel">
        <div className="auth-form-card">
          <div className="auth-top-nav-row">
            <Link to="/" className="auth-back-link">
              ← Back to CLYORA
            </Link>
          </div>
          <div className="auth-mobile-brand">
            <BrandMark />
          </div>
          <h1 className="auth-heading">Welcome back</h1>
          <p className="auth-subheading">
            Sign in to continue your onboarding workspace.
          </p>

          <div className="auth-role-chips" role="group" aria-label="Demo role presets">
            {(["HR Administrator", "Manager", "New Employee"] as const).map((r) => (
              <button
                type="button"
                key={r}
                className={`auth-role-chip ${role === r ? "active" : ""}`}
                onClick={() => handleRoleChange(r)}
              >
                {r === "HR Administrator" ? (
                  <ShieldCheck size={14} />
                ) : r === "Manager" ? (
                  <Users size={14} />
                ) : (
                  <UserRound size={14} />
                )}
                <span>{r === "HR Administrator" ? "HR Admin" : r}</span>
                {role === r && <Check size={12} />}
              </button>
            ))}
          </div>

          {(error || sessionError) && (
            <div className="auth-error-box" role="alert">
              <AlertTriangle size={15} />
              <span>{error || sessionError}</span>
            </div>
          )}

          <form onSubmit={submit} noValidate>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="login-email">
                Work email
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="login-email"
                  className="auth-input"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>
            </div>

            <div className="auth-field-group">
              <div className="auth-field-header">
                <label className="auth-label" htmlFor="login-password">
                  Password
                </label>
                <Link to="/forgot-password" className="auth-forgot-btn">
                  Forgot password?
                </Link>
              </div>
              <div className="auth-input-wrapper">
                <input
                  id="login-password"
                  className="auth-input"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label className="auth-checkbox-row">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Keep me signed in on this device</span>
            </label>

            <button className="auth-submit-btn" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <button
              className="auth-submit-btn"
              type="button"
              onClick={() => api.auth.oidcStart()}
            >
              Continue with organization SSO
            </button>

            <p className="auth-sso-note" role="note">
              Organization SSO is used for deployment. Demo credentials above are for local development only.
            </p>

            <div className="auth-switch-prompt">
              New employee? Ask HR for an invitation.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function Signup() {
  const { acceptInvite: signUp, error: sessionError } = useSession();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (!agreeTerms) {
      setError("Please agree to the terms to continue.");
      return;
    }
    if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use 12–128 characters, including an uppercase letter, a lowercase letter, and a number.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const inviteToken = new URLSearchParams(window.location.search).get("token");
      if (!inviteToken) throw new Error("Open the invitation link sent by HR to create your account.");
      const u = await signUp(inviteToken, password);
      navigate(homeFor(u), { replace: true });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.validationMessage : err instanceof Error ? err.message : "Failed to create account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split-container">
      <AuthBrandPanel />
      <div className="auth-right-panel">
        <div className="auth-form-card">
          <div className="auth-top-nav-row">
            <Link to="/" className="auth-back-link">
              ← Back to CLYORA
            </Link>
          </div>
          <div className="auth-mobile-brand">
            <BrandMark />
          </div>
          <h1 className="auth-heading">Create your CLYORA account</h1>
          <p className="auth-subheading">
            Your CLYORA email determines your workspace: <strong>username.hr@clyora</strong>
            {" "}for HR, <strong>username.manager@clyora</strong> for managers, and
            {" "}<strong>username@clyora</strong> for employees.
          </p>

          {(error || sessionError) && (
            <div className="auth-error-box" role="alert">
              <AlertTriangle size={15} />
              <span>{error || sessionError}</span>
            </div>
          )}

          <form onSubmit={handleSignup}>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="signup-name">
                Full name
              </label>
              <input
                id="signup-name"
                className="auth-input"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Morgan"
                required
              />
            </div>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="signup-company">
                Company
              </label>
              <input
                id="signup-company"
                className="auth-input"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="signup-email">
                Work email
              </label>
              <input
                id="signup-email"
                className="auth-input"
                type="text"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.hr@clyora"
                required
              />
            </div>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="signup-password">
                Password
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="signup-password"
                  className="auth-input"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="12–128 characters, with upper/lowercase and a number"
                  minLength={12}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="auth-field-hint">
                Use 12–128 characters, including uppercase, lowercase, and a number.
              </p>
            </div>
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="signup-confirm">
                Confirm password
              </label>
              <input
                id="signup-confirm"
                className="auth-input"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                required
              />
            </div>
            <label className="auth-checkbox-row">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                required
              />
              <span>
                I agree to use CLYORA in accordance with my organization’s
                policies.
              </span>
            </label>
            <button className="auth-submit-btn" type="submit" disabled={busy}>
              {busy ? "Creating account…" : "Create account"}
            </button>
            <div className="auth-switch-prompt">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [apiMessage, setApiMessage] = useState("");
  const [error, setError] = useState("");

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        demoNote?: string;
      };
      setApiMessage(
        [data.message, data.demoNote].filter(Boolean).join(" ") ||
          "The password recovery endpoint responded, but email delivery is not configured in this environment.",
      );
      setSubmitted(true);
    } catch {
      setError(
        "Unable to reach the password recovery service. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-centered-wrapper">
      <Link to="/" className="auth-back-link">
        ← Back to CLYORA
      </Link>
      <div className="auth-centered-box">
        <BrandMark />
        <h1 className="auth-heading">Reset your password</h1>
        <p className="auth-subheading">
          Enter the email associated with your CLYORA account.
        </p>

        {submitted ? (
          <div>
            <div className="auth-success-banner" role="status">
              <CheckCircle2 size={18} />
              <div>
                <strong>Request received</strong>
                <p>
                  {apiMessage ||
                    "Password recovery email delivery is not configured for this environment. Use your known credentials or contact an administrator."}
                </p>
              </div>
            </div>
            <Link to="/login" className="auth-submit-btn auth-submit-link">
              Return to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset}>
            {error && (
              <div className="auth-error-box" role="alert">
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}
            <div className="auth-field-group" style={{ textAlign: "left" }}>
              <label className="auth-label" htmlFor="reset-email">
                Email
              </label>
              <input
                id="reset-email"
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <button className="auth-submit-btn" type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Request reset"}
            </button>
            <div className="auth-switch-prompt">
              <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
      <div className="auth-centered-footer">
        © {new Date().getFullYear()} CLYORA · Intelligent Employee Onboarding
      </div>
    </div>
  );
}
