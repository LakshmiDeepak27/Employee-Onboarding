import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Users,
  Eye,
  EyeOff,
  FileText,
  Laptop,
  Wallet,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Network,
  ChartNoAxesCombined,
  ArrowUpRight,
  Sun,
  Moon,
  ShieldAlert,
  Calendar,
  Lock,
  Sliders,
  HeartHandshake,
} from "lucide-react";
import { useSession, homeFor } from "./session";
import { useTheme } from "./theme";
import { ClyoraLogo } from "./ClyoraLogo";
import { ApiError, api } from "../lib/api";
import { cleanDisplayDescription } from "./ui";

const BrandMark = ClyoraLogo;

export function PublicThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      className="public-theme-toggle-btn"
      aria-label={theme === "dark" ? "Switch to daylight mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to daylight mode" : "Switch to dark mode"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? (
        <Sun size={15} className="theme-toggle-icon" />
      ) : (
        <Moon size={15} className="theme-toggle-icon" />
      )}
      <span className="public-theme-label">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

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
  const { demoLogin, loading } = useSession();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"hr" | "manager" | "it" | "employee">("hr");
  const [loggingInAs, setLoggingInAs] = useState<string | null>(null);

  async function handleQuickLaunch(email: string) {
    try {
      setLoggingInAs(email);
      const user = await demoLogin(email);
      navigate(homeFor(user), { replace: true });
    } catch {
      navigate("/login");
    } finally {
      setLoggingInAs(null);
    }
  }

  const rolePreviews = {
    hr: {
      role: "HR Administrator",
      name: "Asha Rao",
      email: "asha.hr@clyora",
      badgeClass: "hr",
      focus: "Intake, Plan Approval & Organization Oversight",
      summary: "Full administrative control: generate compliant journeys, review 8-gate validator findings, audit payroll readiness, and execute final sign-off.",
      tasks: [
        { title: "Review proposed onboarding plan for Priya Sharma", area: "DOCUMENTS", status: "VERIFIED", state: "done" },
        { title: "Inspect statutory policy citations (IN-KA POSH & PF)", area: "PAYROLL", status: "MATCHED 100%", state: "done" },
        { title: "Approve and dispatch plan to downstream queues", area: "CHECKPOINT 1", status: "DISPATCHED", state: "done" },
        { title: "Final completion sign-off (Day 1 Readiness)", area: "CHECKPOINT 2", status: "READY", state: "active" },
      ],
      metrics: { progress: 83, stat1: "18 Tasks", stat2: "0 Blockers", stat3: "Checkpoint 1 Done" },
    },
    it: {
      role: "IT Administrator",
      name: "Vikram Malhotra",
      email: "vikram.it@clyora",
      badgeClass: "it",
      focus: "Hardware Logistics, Asset Tagging & Account Provisioning",
      summary: "Hardware fulfillment queue: reserve laptops, generate zero-touch PowerShell scripts, configure Azure AD roles, and issue building security badges.",
      tasks: [
        { title: "Provision Lenovo ThinkPad P16s workstation", area: "EQUIPMENT", status: "IMAGED", state: "done" },
        { title: "Create system accounts (Google Workspace, Slack, Jira)", area: "EQUIPMENT", status: "CONFIGURED", state: "done" },
        { title: "Generate automated PowerShell onboarding pack", area: "EQUIPMENT", status: "READY", state: "done" },
        { title: "Issue building security badge & RFID credentials", area: "EQUIPMENT", status: "IN_TRANSIT", state: "active" },
      ],
      metrics: { progress: 75, stat1: "4 Devices", stat2: "Script Ready", stat3: "1 Dispatch Left" },
    },
    manager: {
      role: "Engineering Manager",
      name: "David Chen",
      email: "david.manager@clyora",
      badgeClass: "manager",
      focus: "Direct Report Onboarding, Buddy Pairing & Day 1 Itinerary",
      summary: "Empower new team members: pair an onboarding buddy, set Day-1 welcome agendas, and define 30-60-90 day engineering goals without payroll data exposure.",
      tasks: [
        { title: "Assign an onboarding buddy for Priya Sharma", area: "MANAGER", status: "DAVID CHEN", state: "done" },
        { title: "Prepare Day One Schedule (09:00 Welcome & IT sync)", area: "MANAGER", status: "CONFIRMED", state: "done" },
        { title: "Schedule 1-on-1 team introductory syncs", area: "MANAGER", status: "CALENDAR SET", state: "done" },
        { title: "Define 30-60-90 probation goals & repo access", area: "MANAGER", status: "IN_REVIEW", state: "active" },
      ],
      metrics: { progress: 88, stat1: "3 Direct Reports", stat2: "Buddy Paired", stat3: "Day 1 Ready" },
    },
    employee: {
      role: "New Hire Engineer",
      name: "Priya Sharma",
      email: "priya.dev@clyora",
      badgeClass: "employee",
      focus: "Personal Journey, Document Uploads & Compliance Learning",
      summary: "Personal onboarding command center: submit identity proofs, complete mandatory statutory compliance training, and elect company health benefits.",
      tasks: [
        { title: "Upload National ID & Address proof (Aadhaar / PAN)", area: "DOCUMENTS", status: "VERIFIED", state: "done" },
        { title: "Complete POSH Prevention of Sexual Harassment training", area: "TRAINING", status: "IN_PROGRESS", state: "active" },
        { title: "Submit Form 12BB tax declaration and salary account", area: "PAYROLL", status: "SUBMITTED", state: "done" },
        { title: "Review group health insurance benefit elections", area: "BENEFITS", status: "ELECTED", state: "done" },
      ],
      metrics: { progress: 78, stat1: "14/18 Done", stat2: "2 Required Left", stat3: "Joining in 4 Days" },
    },
  };

  const currentPreview = rolePreviews[activeTab];

  return (
    <div className="landing-page">
      {/* 1. Frosted Modern Navbar */}
      <header className="landing-navbar">
        <div className="landing-nav-inner">
          <Link className="landing-brand-wrap" to="/">
            <BrandMark />
            <span className="landing-brand-pill">Enterprise Orchestrator</span>
          </Link>

          <nav className="landing-nav-links" aria-label="Main Navigation">
            <a href="#platform" className="landing-nav-link">Platform</a>
            <a href="#work-areas" className="landing-nav-link">6 Work Areas</a>
            <a href="#guardrails" className="landing-nav-link">8 Safety Gates</a>
            <a href="#workspaces" className="landing-nav-link">Workspaces</a>
            <a href="#evaluation" className="landing-nav-link">Evaluation Proof</a>
          </nav>

          <div className="landing-nav-actions">
            <PublicThemeToggle />
            <Link className="landing-btn-login" to="/login">
              Sign in
            </Link>
            <button
              type="button"
              className="landing-btn-signup"
              onClick={() => void handleQuickLaunch("asha.hr@clyora")}
              disabled={loading || !!loggingInAs}
            >
              {loggingInAs === "asha.hr@clyora" ? "Launching…" : "Launch HR Demo"}
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero Section */}
        <section className="landing-hero-section">
          <div className="landing-hero-inner">
            <div className="landing-hero-badge-wrap">
              <span className="landing-hero-pulse-dot" />
              <span className="landing-hero-eyebrow-text">
                AI Innovation Challenge · Use Case 3 · Enterprise Multi-Agent Orchestrator
              </span>
            </div>

            <h1 className="landing-hero-title">
              Every employee journey,{" "}
              <span className="landing-hero-title-highlight">coordinated, verified & deterministic.</span>
            </h1>

            <p className="landing-hero-subtitle">
              CLYORA orchestrates documents, IT equipment, payroll setup, benefits enrolment,
              compliance training, and manager tasks across US, UK, Canada, and India — protected by
              an <strong>8-stage deterministic safety DAG</strong> that guarantees zero LLM hallucinations.
            </p>

            <div className="landing-hero-cta-row">
              <Link className="landing-cta-primary" to="/login">
                <Sparkles size={16} />
                Enter Live Workspace
                <ArrowRight size={16} />
              </Link>
              <a className="landing-cta-secondary" href="#guardrails">
                <ShieldCheck size={16} />
                Explore 8-Gate Safety Chain
              </a>
              <a className="landing-cta-secondary" href="#evaluation">
                <FileText size={16} />
                Golden Eval Benchmark (100%)
              </a>
            </div>

            {/* Interactive Hero Live Dashboard Mockup */}
            <div className="landing-hero-preview-container">
              <div className="landing-preview-header-bar">
                <div className="landing-preview-window-dots">
                  <span className="window-dot red" />
                  <span className="window-dot yellow" />
                  <span className="window-dot green" />
                </div>
                <div className="landing-preview-tabs">
                  {(["hr", "it", "manager", "employee"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`landing-preview-tab ${activeTab === tab ? "active" : ""}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {rolePreviews[tab].role}
                    </button>
                  ))}
                </div>
                <div className="landing-preview-status-pill">
                  <span className="status-indicator live" />
                  Live Reactive State
                </div>
              </div>

              <div className="landing-preview-card-body">
                <div className="landing-preview-top-strip">
                  <div className="landing-preview-user-info">
                    <div className="landing-preview-avatar">
                      {currentPreview.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="landing-preview-user-header">
                        <strong>{currentPreview.name}</strong>
                        <span className={`landing-preview-role-pill ${currentPreview.badgeClass}`}>
                          {currentPreview.role}
                        </span>
                      </div>
                      <p className="landing-preview-focus">{currentPreview.focus}</p>
                    </div>
                  </div>

                  <div className="landing-preview-stat-chips">
                    <div className="landing-preview-stat-box">
                      <small>Journey Progress</small>
                      <strong>{currentPreview.metrics.progress}%</strong>
                    </div>
                    <div className="landing-preview-stat-box">
                      <small>SLA Status</small>
                      <strong className="status-good">{currentPreview.metrics.stat2}</strong>
                    </div>
                    <div className="landing-preview-stat-box">
                      <small>Safety Gates</small>
                      <strong className="status-verified">V1–V8 Passed</strong>
                    </div>
                  </div>
                </div>

                <div className="landing-preview-progress-bar-wrap">
                  <div
                    className="landing-preview-progress-fill"
                    style={{ width: `${currentPreview.metrics.progress}%` }}
                  />
                </div>

                <div className="landing-preview-task-grid">
                  {currentPreview.tasks.map((task, idx) => (
                    <div key={idx} className={`landing-preview-task-item ${task.state}`}>
                      <div className="task-status-icon">
                        {task.state === "done" ? <Check size={13} /> : <div className="dot-pulse" />}
                      </div>
                      <div className="task-detail-wrap">
                        <span className="task-area-tag">{task.area}</span>
                        <p className="task-name-text">{task.title}</p>
                      </div>
                      <span className={`task-badge-state ${task.state}`}>{task.status}</span>
                    </div>
                  ))}
                </div>

                <div className="landing-preview-footer-action">
                  <p className="landing-preview-summary-text">{currentPreview.summary}</p>
                  <button
                    type="button"
                    className="landing-preview-direct-btn"
                    onClick={() => void handleQuickLaunch(currentPreview.email)}
                    disabled={loading || !!loggingInAs}
                  >
                    {loggingInAs === currentPreview.email ? "Launching Workspace…" : `Open as ${currentPreview.role} →`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Enterprise Stats Ribbon */}
        <section className="landing-stats-ribbon">
          <div className="landing-stats-inner">
            <div className="landing-stat-block">
              <strong>6</strong>
              <span>Core Work Areas</span>
            </div>
            <div className="landing-stat-block">
              <strong>8-Stage</strong>
              <span>Deterministic Safety DAG</span>
            </div>
            <div className="landing-stat-block">
              <strong>4</strong>
              <span>Role-Specific Workspaces</span>
            </div>
            <div className="landing-stat-block">
              <strong>100%</strong>
              <span>Golden Eval Pass Rate</span>
            </div>
            <div className="landing-stat-block">
              <strong>&lt;10ms</strong>
              <span>Average Gate Latency</span>
            </div>
            <div className="landing-stat-block">
              <strong>Zero</strong>
              <span>Hallucination Guarantee</span>
            </div>
          </div>
        </section>

        {/* 4. Six Core Work Areas Showcase */}
        <section className="landing-features-section" id="work-areas">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Work Orchestration</p>
            <h2 className="landing-section-title">Six Work Areas Released on Approval</h2>
            <p className="landing-section-sub">
              When HR approves the plan at Checkpoint 1, tasks are deterministically dispatched
              across specialized service queues with topological dependency guarantees.
            </p>
          </div>

          <div className="landing-features-grid">
            <article className="landing-feature-card">
              <div className="landing-feature-icon-wrap blue">
                <FileText size={20} />
              </div>
              <h3>1. Documents Engine</h3>
              <p>
                Right-to-work verification, passport/national ID proofs, NDA and employment contract signatures
                with encrypted document storage and status tracking.
              </p>
              <div className="feature-pill-row">
                <span className="feature-pill">Right to Work</span>
                <span className="feature-pill">ID Proof</span>
                <span className="feature-pill">NDAs</span>
              </div>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon-wrap emerald">
                <Laptop size={20} />
              </div>
              <h3>2. IT Equipment & Access</h3>
              <p>
                Zero-touch hardware logistics: workstation procurement, laptop imaging, peripheral kits,
                and automated PowerShell / Azure AD provisioning pack generation.
              </p>
              <div className="feature-pill-row">
                <span className="feature-pill">Laptop Imaging</span>
                <span className="feature-pill">PowerShell Pack</span>
                <span className="feature-pill">Badges</span>
              </div>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon-wrap amber">
                <Wallet size={20} />
              </div>
              <h3>3. Statutory Payroll Setup</h3>
              <p>
                Jurisdiction-driven payroll preparation: US W-4, Canada TD1, UK P45, and India Form 12BB
                with direct deposit banking validation and first-run audit safeguards.
              </p>
              <div className="feature-pill-row">
                <span className="feature-pill">Tax Declarations</span>
                <span className="feature-pill">Direct Deposit</span>
                <span className="feature-pill">First-Run Lock</span>
              </div>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon-wrap purple">
                <HeartHandshake size={20} />
              </div>
              <h3>4. Benefits Enrolment</h3>
              <p>
                Automated 30-day statutory enrollment window tracking, regional group medical insurance,
                pension auto-enrolment, and dependent declarations.
              </p>
              <div className="feature-pill-row">
                <span className="feature-pill">30-Day Window</span>
                <span className="feature-pill">Pension Auto-Enrol</span>
                <span className="feature-pill">Healthcare</span>
              </div>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon-wrap indigo">
                <GraduationCap size={20} />
              </div>
              <h3>5. Statutory Training</h3>
              <p>
                Location-mandated compliance learning: India POSH Act, Ontario OHS Reg 297/13, UK GDPR 2018,
                and role-specific software engineering toolchain courses.
              </p>
              <div className="feature-pill-row">
                <span className="feature-pill">POSH Compliance</span>
                <span className="feature-pill">OHS Training</span>
                <span className="feature-pill">GDPR 2018</span>
              </div>
            </article>

            <article className="landing-feature-card">
              <div className="landing-feature-icon-wrap rose">
                <Users size={20} />
              </div>
              <h3>6. Manager Tasks</h3>
              <p>
                Structured team enablement: onboarding buddy assignment, Day-One structured welcome itinerary,
                introductory 1-on-1 calendar syncs, and 30-60-90 probation goals.
              </p>
              <div className="feature-pill-row">
                <span className="feature-pill">Buddy Pairing</span>
                <span className="feature-pill">Day 1 Schedule</span>
                <span className="feature-pill">Probation Goals</span>
              </div>
            </article>
          </div>
        </section>

        {/* 5. The 8-Stage Deterministic Safety Chain */}
        <section className="landing-guardrails-section" id="guardrails">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Zero-Hallucination Architecture</p>
            <h2 className="landing-section-title">The 8-Stage Deterministic Safety Chain (V1 – V8)</h2>
            <p className="landing-section-sub">
              No unverified AI proposal can ever enter an employee record. Every plan passes through eight
              rigid verification gates evaluated in under 10 milliseconds.
            </p>
          </div>

          <div className="landing-gates-grid">
            {[
              { id: "V1", title: "Schema Conformance", desc: "Rejects malformed JSON; locks candidate tasks to strict Zod shape.", icon: CheckCircle2 },
              { id: "V2", title: "Quote Authenticity", desc: "Computes token similarity against authoritative policy database (>80%).", icon: FileText },
              { id: "V3", title: "Jurisdiction Guard", desc: "Strictly isolates rules; stops cross-border policy contamination.", icon: ShieldAlert },
              { id: "V4", title: "Statutory Coverage", desc: "Detects missing legal mandates (POSH, OHS) and automatically injects them.", icon: ShieldCheck },
              { id: "V5", title: "DAG Graph Integrity", desc: "Runs topological sorting to eliminate circular dependency deadlocks.", icon: Network },
              { id: "V6", title: "Calendar SLA Engine", desc: "Calculates deadlines via code using regional business-day calendars.", icon: Calendar },
              { id: "V7", title: "Authority Guard", desc: "Flags PAY_AFFECTING and LEGAL tasks for mandatory human review.", icon: Lock },
              { id: "V8", title: "Closed Vocabulary", desc: "Locks task types to the 32 authorized enum values and role assignments.", icon: Sliders },
            ].map((gate) => (
              <div className="landing-gate-card" key={gate.id}>
                <div className="gate-header-row">
                  <span className="gate-id-badge">{gate.id}</span>
                  <gate.icon size={17} className="gate-icon" />
                </div>
                <h4>{gate.title}</h4>
                <p>{gate.desc}</p>
              </div>
            ))}
          </div>

          <div className="landing-ai-boundary-box">
            <div className="ai-boundary-badge">AI Safety Boundary</div>
            <h4>Strict Separation of Capabilities: What AI Cannot Do</h4>
            <div className="ai-boundary-grid">
              <div className="ai-boundary-item">
                <CheckCircle2 size={16} className="text-error" />
                <span>AI <strong>cannot</strong> assign roles or escalate permissions</span>
              </div>
              <div className="ai-boundary-item">
                <CheckCircle2 size={16} className="text-error" />
                <span>AI <strong>cannot</strong> approve onboarding plans or dispatch tasks</span>
              </div>
              <div className="ai-boundary-item">
                <CheckCircle2 size={16} className="text-error" />
                <span>AI <strong>cannot</strong> override deterministic business calendar dates</span>
              </div>
              <div className="ai-boundary-item">
                <CheckCircle2 size={16} className="text-error" />
                <span>AI <strong>cannot</strong> bypass safety checks or invent new task types</span>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Four Role Workspaces with 1-Click Launch */}
        <section className="landing-roles-section" id="workspaces">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Workspaces</p>
            <h2 className="landing-section-title">Designed Around Real Responsibilities</h2>
            <p className="landing-section-sub">
              Role-Based Access Control (RBAC) ensures each stakeholder sees exactly what they need to act
              without sensitive data exposure. Click any role below to launch the live demo immediately.
            </p>
          </div>

          <div className="landing-roles-grid">
            <article className="landing-role-card hr">
              <div className="role-card-header">
                <span className="landing-role-badge hr">HR Administrator</span>
                <span className="role-email-chip">asha.hr@clyora</span>
              </div>
              <h3>Asha Rao · People Operations</h3>
              <p>
                Worker intake, journey review, Checkpoint 1 (Plan Approval), cross-department queues,
                payroll verification, and Checkpoint 2 (Final Sign-off).
              </p>
              <ul className="landing-role-checklist">
                <li><Check size={14} /> Organization employee directory & intake</li>
                <li><Check size={14} /> Human-in-the-loop plan inspection</li>
                <li><Check size={14} /> Checkpoint 2 final active completion sign-off</li>
              </ul>
              <button
                type="button"
                className="landing-role-launch-btn hr"
                onClick={() => void handleQuickLaunch("asha.hr@clyora")}
                disabled={loading || !!loggingInAs}
              >
                {loggingInAs === "asha.hr@clyora" ? "Signing In…" : "Launch as HR Admin"}
                <ArrowRight size={14} />
              </button>
            </article>

            <article className="landing-role-card manager">
              <div className="role-card-header">
                <span className="landing-role-badge manager">Engineering Manager</span>
                <span className="role-email-chip">david.manager@clyora</span>
              </div>
              <h3>David Chen · Team Enablement</h3>
              <p>
                Direct reports overview, buddy assignment, Day-One structured welcome schedule,
                and introductory syncs without exposure to employee payroll or tax data.
              </p>
              <ul className="landing-role-checklist">
                <li><Check size={14} /> Direct reports roster & status tracking</li>
                <li><Check size={14} /> Onboarding buddy pairing & Day 1 checklist</li>
                <li><Check size={14} /> 30-60-90 probation goal agreements</li>
              </ul>
              <button
                type="button"
                className="landing-role-launch-btn manager"
                onClick={() => void handleQuickLaunch("david.manager@clyora")}
                disabled={loading || !!loggingInAs}
              >
                {loggingInAs === "david.manager@clyora" ? "Signing In…" : "Launch as Manager"}
                <ArrowRight size={14} />
              </button>
            </article>

            <article className="landing-role-card it">
              <div className="role-card-header">
                <span className="landing-role-badge it">IT Administrator</span>
                <span className="role-email-chip">vikram.it@clyora</span>
              </div>
              <h3>Vikram Malhotra · IT Operations</h3>
              <p>
                Hardware fulfillment queue, laptop imaging, system accounts (Google, Slack, GitHub),
                and automated PowerShell / Azure AD provisioning packs.
              </p>
              <ul className="landing-role-checklist">
                <li><Check size={14} /> Laptop procurement & delivery status</li>
                <li><Check size={14} /> Automated PowerShell provisioning pack</li>
                <li><Check size={14} /> Single-click access badge issuance</li>
              </ul>
              <button
                type="button"
                className="landing-role-launch-btn it"
                onClick={() => void handleQuickLaunch("vikram.it@clyora")}
                disabled={loading || !!loggingInAs}
              >
                {loggingInAs === "vikram.it@clyora" ? "Signing In…" : "Launch as IT Admin"}
                <ArrowRight size={14} />
              </button>
            </article>

            <article className="landing-role-card employee">
              <div className="role-card-header">
                <span className="landing-role-badge employee">New Hire Employee</span>
                <span className="role-email-chip">priya.dev@clyora</span>
              </div>
              <h3>Priya Sharma · Senior Engineer</h3>
              <p>
                A unified personal journey: submit identity documents, complete statutory POSH training,
                fill out tax forms, and review company health benefit options.
              </p>
              <ul className="landing-role-checklist">
                <li><Check size={14} /> Clear personal progress & next step guidance</li>
                <li><Check size={14} /> Secure document upload & tax declaration</li>
                <li><Check size={14} /> Mandatory compliance learning & benefits</li>
              </ul>
              <button
                type="button"
                className="landing-role-launch-btn employee"
                onClick={() => void handleQuickLaunch("priya.dev@clyora")}
                disabled={loading || !!loggingInAs}
              >
                {loggingInAs === "priya.dev@clyora" ? "Signing In…" : "Launch as Employee"}
                <ArrowRight size={14} />
              </button>
            </article>
          </div>
        </section>

        {/* 7. Golden Evaluation Benchmark Proof */}
        <section className="landing-eval-section" id="evaluation">
          <div className="landing-section-header">
            <p className="landing-section-eyebrow">Harness & Evidence</p>
            <h2 className="landing-section-title">Verified by Automated Golden Evaluation Harness</h2>
            <p className="landing-section-sub">
              Every release is tested against our 7-suite benchmark containing multi-jurisdiction personas
              and adversarial prompt injection attacks.
            </p>
          </div>

          <div className="landing-terminal-card">
            <div className="terminal-header">
              <div className="terminal-dots">
                <span className="t-dot red" />
                <span className="t-dot yellow" />
                <span className="t-dot green" />
              </div>
              <span className="terminal-title">bash — npm run eval</span>
              <span className="terminal-status-tag">100% PASS</span>
            </div>
            <pre className="terminal-body">
              <code>
                {`> employee-onboarding@0.1.0 eval
> tsx evals/run_evals.ts

====================================================================================
       CLYORA MULTI-AGENT ORCHESTRATOR - GOLDEN EVALUATION HARNESS
====================================================================================
  Benchmark: Guardrail Gates V1 - V8 | Closed Vocabulary | Multi-Jurisdiction
====================================================================================

| Status | Scenario ID               | Jurisdiction | Focus Area                 | Latency |
|:------:|:--------------------------|:------------:|:---------------------------|--------:|
|  PASS  | SCENARIO-01-CA-DEV        | CA-ON        | Ontario Senior Developer   |     6ms |
|  PASS  | SCENARIO-02-GB-SALES      | GB           | UK Sales Executive         |     1ms |
|  PASS  | SCENARIO-03-IN-ENG        | IN-KA        | India Backend Engineer     |     0ms |
|  PASS  | SCENARIO-04-SG-REFUSAL    | SG           | Singapore Contractor       |     1ms |
|  PASS  | SCENARIO-05-ADV-OMISSION  | CA-ON        | Adversarial: Omission (V4) |     4ms |
|  PASS  | SCENARIO-06-ADV-HALLUCIN  | CA-ON        | Adversarial: Hallucination |     7ms |
|  PASS  | SCENARIO-07-ADV-FAKE-QUO  | CA-ON        | Adversarial: Fake Citation |     1ms |

====================================================================================
                         GOLDEN BENCHMARK SCORECARD
====================================================================================
  Scenarios Evaluated:              7 / 7 (100% Pass Rate)
  Statutory Omission Prevention:   100.0% (Gate V4 Auto-Insertion Active)
  Hallucination Rejection Rate:     100.0% (Gate V1 Closed Schema Lock)
  Citation Quote Verification:      100.0% (Exact: 100% | Fabricated: 0%)
  Latency Performance:              Avg: 4ms | p95: 10ms
====================================================================================
 ALL EVALUATION BENCHMARKS PASSED (100% Compliance Verified)`}
              </code>
            </pre>
          </div>
        </section>

        {/* 8. Call to Action Banner */}
        <section className="landing-cta-banner-section">
          <div className="landing-cta-banner-inner">
            <div>
              <h2>Ready to coordinate your new-hire onboarding with zero hallucinations?</h2>
              <p>
                Sign in to your CLYORA workspace or test the interactive platform using any pre-configured
                evaluation persona.
              </p>
            </div>
            <div className="landing-banner-btns">
              <Link className="landing-banner-primary" to="/login">
                Sign In to Workspace
              </Link>
              <button
                type="button"
                className="landing-banner-secondary"
                onClick={() => void handleQuickLaunch("asha.hr@clyora")}
              >
                Launch HR Demo
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* 9. Polished Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-top">
            <div className="landing-footer-brand">
              <BrandMark size="sm" />
              <p>Enterprise Employee Onboarding Orchestrator</p>
            </div>
            <div className="landing-footer-actions">
              <PublicThemeToggle />
              <Link to="/login" className="landing-footer-link">Sign In</Link>
              <a href="/docs" target="_blank" rel="noreferrer" className="landing-footer-link">OpenAPI Docs</a>
              <a href="https://youtu.be/sUSnpZo5RgE" target="_blank" rel="noreferrer" className="landing-footer-link">YouTube Demo</a>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <span>© {new Date().getFullYear()} CLYORA. Built for enterprise reliability.</span>
            <span>Multi-Jurisdictional Compliance · 8-Stage Safety DAG · Sub-10ms Gate Execution</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Login() {
  const { user, loading, signingOut, error: sessionError, demoLogin } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const ssoError = searchParams.get("error");
  const displaySsoError = ssoError?.includes("not provisioned in CLYORA")
    ? "Your organization sign-in worked, but HR has not provisioned this account in CLYORA yet. Ask HR to add your exact Keycloak email and assign your app role. For the first HR account, set BOOTSTRAP_HR_EMAIL to that email and run the database seed command."
    : ssoError;
  const ssoSuccess = searchParams.get("sso") === "success";
  const signedOut = searchParams.get("signedOut") === "1";
  const [startingSso, setStartingSso] = useState(false);
  const [loggingInAs, setLoggingInAs] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    navigate(homeFor(user), { replace: true });
  }, [loading, user, navigate]);

  async function handleDemoLogin(email: string) {
    try {
      setLoggingInAs(email);
      setLoginError(null);
      await demoLogin(email);
    } catch (err: any) {
      setLoginError(err?.message || "Demo sign-in failed. Please try again.");
    } finally {
      setLoggingInAs(null);
    }
  }

  const activeError = loginError || displaySsoError || sessionError;

  return (
    <div className="auth-split-container">
      <AuthBrandPanel />
      <div className="auth-right-panel">
        <div className="auth-form-card">
          <div className="auth-top-nav-row">
            <Link to="/" className="auth-back-link">← Back to CLYORA</Link>
            <PublicThemeToggle />
          </div>
          <div className="auth-mobile-brand"><BrandMark /></div>
          <h1 className="auth-heading">Welcome back</h1>
          <p className="auth-subheading">Sign in to continue your onboarding workspace.</p>

          {activeError && (
            <div className="auth-error-box" role="alert">
              <AlertTriangle size={15} />
              <span>{activeError}</span>
            </div>
          )}
          {signingOut && (
            <div className="auth-notice-box" role="status">
              Finishing sign out securely…
            </div>
          )}
          {signedOut && !activeError && !signingOut && (
            <div className="auth-notice-box" role="status">
              You’re signed out. Sign in again whenever you’re ready.
            </div>
          )}
          {ssoSuccess && (loading || !user) && !activeError && (
            <div className="auth-notice-box" role="status">
              Signing in succeeded. Loading your workspace…
            </div>
          )}
          {user && !loading ? (
            <div className="loading" role="status">Opening your workspace…</div>
          ) : (
            <>
              <div className="auth-quick-login-section">
                <div className="auth-divider">
                  <span>One-Click Role Sign In</span>
                </div>
                <div className="auth-quick-login-grid">
                  <button
                    type="button"
                    className="auth-quick-role-btn hr"
                    onClick={() => void handleDemoLogin("asha.hr@clyora")}
                    disabled={loading || !!loggingInAs || startingSso}
                  >
                    <div className="auth-quick-role-badge">HR Administrator</div>
                    <div className="auth-quick-role-name">
                      {loggingInAs === "asha.hr@clyora" ? "Signing in as Asha Rao…" : "Sign In as Asha Rao (HR)"}
                    </div>
                    <div className="auth-quick-role-email">asha.hr@clyora</div>
                    <div className="auth-quick-role-desc">Full access · Plan approvals · Employee directory · Payroll</div>
                  </button>

                  <button
                    type="button"
                    className="auth-quick-role-btn manager"
                    onClick={() => void handleDemoLogin("david.manager@clyora")}
                    disabled={loading || !!loggingInAs || startingSso}
                  >
                    <div className="auth-quick-role-badge">Engineering Manager</div>
                    <div className="auth-quick-role-name">
                      {loggingInAs === "david.manager@clyora" ? "Signing in as David Chen…" : "Sign In as David Chen (Manager)"}
                    </div>
                    <div className="auth-quick-role-email">david.manager@clyora</div>
                    <div className="auth-quick-role-desc">Direct reports · Welcome buddy · Day-one checklist</div>
                  </button>

                  <button
                    type="button"
                    className="auth-quick-role-btn it"
                    onClick={() => void handleDemoLogin("vikram.it@clyora")}
                    disabled={loading || !!loggingInAs || startingSso}
                  >
                    <div className="auth-quick-role-badge">IT Administrator</div>
                    <div className="auth-quick-role-name">
                      {loggingInAs === "vikram.it@clyora" ? "Signing in as Vikram Malhotra…" : "Sign In as Vikram Malhotra (IT)"}
                    </div>
                    <div className="auth-quick-role-email">vikram.it@clyora</div>
                    <div className="auth-quick-role-desc">Hardware fulfillment · Laptop imaging · PowerShell pack</div>
                  </button>

                  <button
                    type="button"
                    className="auth-quick-role-btn employee"
                    onClick={() => void handleDemoLogin("priya.dev@clyora")}
                    disabled={loading || !!loggingInAs || startingSso}
                  >
                    <div className="auth-quick-role-badge">New Hire (Engineer)</div>
                    <div className="auth-quick-role-name">
                      {loggingInAs === "priya.dev@clyora" ? "Signing in as Priya Sharma…" : "Sign In as Priya Sharma (New Hire)"}
                    </div>
                    <div className="auth-quick-role-email">priya.dev@clyora</div>
                    <div className="auth-quick-role-desc">Employee portal · Document upload · POSH training · Benefits</div>
                  </button>
                </div>
              </div>

              <div className="auth-divider">
                <span>Or Organization SSO</span>
              </div>

              <button
                className="auth-submit-btn"
                type="button"
                onClick={() => {
                  setStartingSso(true);
                  api.auth.oidcStart();
                }}
                disabled={loading || startingSso || signingOut || !!loggingInAs}
                aria-busy={startingSso}
              >
                {startingSso ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <ShieldCheck size={18} />
                )}
                {startingSso ? "Connecting to Keycloak…" : "Continue with Organization SSO (Keycloak)"}
              </button>
              <p className="auth-sso-note" role="note">
                Enterprise OpenID Connect (requires Keycloak OIDC configuration).
              </p>
              <div className="auth-switch-prompt">
                New employee? Ask HR for an invitation link.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function Signup() {
  const { acceptInvite: signUp, error: sessionError } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("An invitation token is required. Open the invitation link sent by HR.");
      return;
    }
    if (!agreeTerms) {
      setError("Please agree to the policies to continue.");
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
      const u = await signUp(token, password);
      navigate(homeFor(u), { replace: true });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.validationMessage : err instanceof Error ? err.message : "Failed to activate account. The invitation may be invalid or expired.");
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
            <PublicThemeToggle />
          </div>
          <div className="auth-mobile-brand">
            <BrandMark />
          </div>
          <h1 className="auth-heading">
            {token ? "Activate your portal account" : "Invitation Required"}
          </h1>
          <p className="auth-subheading">
            {token
              ? "Set your account password to activate your onboarding portal access."
              : "Self-service registration is disabled. You must open the invitation link provided by your HR administrator, or sign in using Keycloak SSO."}
          </p>

          {(error || sessionError) && (
            <div className="auth-error-box" role="alert">
              <AlertTriangle size={15} />
              <span>{error || sessionError}</span>
            </div>
          )}

          {token ? (
            <form onSubmit={handleSignup}>
              <div className="auth-field-group">
                <label className="auth-label" htmlFor="signup-password">
                  New Password
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="signup-password"
                    className="auth-input"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
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
                  12+ characters, uppercase, lowercase, and a number.
                </p>
              </div>
              <div className="auth-field-group">
                <label className="auth-label" htmlFor="signup-confirm">
                  Confirm Password
                </label>
                <input
                  id="signup-confirm"
                  className="auth-input"
                  type="password"
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
                  I agree to use CLYORA in accordance with my organization’s policies.
                </span>
              </label>
              <button className="auth-submit-btn" type="submit" disabled={busy}>
                {busy ? "Activating account…" : "Activate and Sign In"}
              </button>
              <div className="auth-switch-prompt">
                Already active? <Link to="/login">Sign in</Link>
              </div>
            </form>
          ) : (
            <div style={{ marginTop: "1.5rem" }}>
              <Link
                to="/login"
                className="button primary"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "12px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Go to Sign In
              </Link>
            </div>
          )}
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
        cleanDisplayDescription(
          [data.message, data.demoNote].filter(Boolean).join(" ") ||
            "The password recovery endpoint responded, but email delivery is not configured in this environment.",
        ),
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
      <div className="auth-top-nav-row auth-top-nav-centered">
        <Link to="/" className="auth-back-link">
          ← Back to CLYORA
        </Link>
        <PublicThemeToggle />
      </div>
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
