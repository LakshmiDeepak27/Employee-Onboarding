import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileCheck2,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import {
  CreateEmployeeRequestSchema,
  type PlanTask,
  type Plan,
} from "@eo/contracts";
import { api, can } from "../lib/api";
import { useSession, workspaceFor } from "./session";
import {
  Heading,
  Panel,
  Empty,
  QueryState,
  Badge,
  Metric,
  Progress,
  Feedback,
  human,
  date,
} from "./ui";

export function Dashboard() {
  const { user } = useSession();
  const w = workspaceFor(user!);
  const plans = useQuery({
    queryKey: ["plans", "overview"],
    queryFn: () => api.plans.list({ pageSize: 100 }),
  });
  const people = useQuery({
    queryKey: ["people", "count"],
    queryFn: () => api.employees.list({ pageSize: 1 }),
    // Roles without employee.read should not fire an API request they are
    // expected to be denied. This also keeps employee dashboards clean.
    enabled: can(user, "employee.read"),
  });
  const rows = plans.data?.items ?? [];
  const open = rows.filter(
    (p) => !["COMPLETED", "CANCELLED", "REFUSED"].includes(p.status),
  );
  const review = rows.filter((p) =>
    ["DRAFT", "AWAITING_APPROVAL", "AWAITING_COMPLETION_APPROVAL"].includes(p.status),
  );
  const total = rows.reduce((n, p) => n + p.taskCount, 0);
  const done = rows.reduce((n, p) => n + p.completedCount, 0);
  const risk = rows.reduce((n, p) => n + p.atRiskCount, 0);
  return (
    <>
      <Heading
        title={
          w === "hr"
            ? "Onboarding operations"
            : w === "manager"
              ? "Team onboarding overview"
              : `Welcome to CLYORA, ${user?.firstName ?? "there"}.`
        }
        description={
          w === "hr"
            ? "Monitor active journeys, pending approvals and work that needs attention."
            : w === "manager"
              ? "See who is joining soon and clear the path to their first day."
              : "Let's get you ready for your first day — start with the next open task."
        }
        actions={
          can(user, "employee.create") ? (
            <Link className="button primary" to="/hr/employees/new">
              <Plus size={16} />
              Add employee
            </Link>
          ) : undefined
        }
      />
      <div className="overview-banner">
        <div>
          <span className="eyebrow">
            {w === "employee"
              ? "YOUR ONBOARDING JOURNEY"
              : "CLYORA · INTELLIGENT EMPLOYEE ONBOARDING"}
          </span>
          <h2>
            {w === "employee"
              ? "A clear path to day-one readiness."
              : "Every employee journey, seamlessly connected."}
          </h2>
          <p>
            {w === "employee"
              ? "Continue with your plan. Documents, equipment, training and manager steps stay in one place."
              : "Coordinate HR, IT, finance and managers from one shared onboarding workspace."}
          </p>
          <Link to={`/${w}/${w === "hr" ? "plans" : "onboarding"}`}>
            {w === "employee" ? "Continue onboarding" : "View onboarding plans"}{" "}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span>01</span>
          <i />
          <span>02</span>
          <i />
          <span>
            <ShieldCheck size={23} />
          </span>
        </div>
      </div>
      <QueryState query={plans}>
        <div className="metrics">
          <Metric
            label={w === "employee" ? "My plans" : "Active journeys"}
            value={open.length}
            detail="Open plans in loaded records"
            to={`/${w}/${w === "hr" ? "plans" : "onboarding"}`}
          />
          <Metric
            label="Tasks completed"
            value={`${done} / ${total}`}
            detail="Completed and skipped plan tasks"
          />
          <Metric
            label="Needs attention"
            value={risk}
            detail="Tasks flagged at risk"
          />
          <Metric
            label={w === "hr" ? "Awaiting review" : "People in scope"}
            value={
              w === "hr"
                ? review.length
                : !can(user, "employee.read")
                  ? "—"
                  : people.isError
                  ? "Unavailable"
                  : (people.data?.meta.totalItems ?? "—")
            }
            detail={
              w === "hr"
                ? "Draft and pending approval plans"
                : "Based on your account permissions"
            }
          />
        </div>
        <div className="dashboard-grid">
          <Panel
            title={
              w === "employee"
                ? "Your onboarding journey"
                : "Onboarding in motion"
            }
            description="Most recent plans · up to 100 records"
            action={
              <Link
                className="text-link"
                to={`/${w}/${w === "hr" ? "plans" : "onboarding"}`}
              >
                View all <ArrowUpRight size={14} />
              </Link>
            }
          >
            <PlanTable rows={rows.slice(0, 5)} />
          </Panel>
          <Panel
            title="Your next move"
            description="Keep the important work close"
          >
            <div className="quick-actions">
              {(w === "hr"
                ? [
                    [
                      "approvals",
                      "Review proposed plans",
                      "Approve the next steps with confidence",
                    ],
                    [
                      "employees",
                      "Prepare a new hire",
                      "Keep employee profiles up to date",
                    ],
                    [
                      "documents",
                      "Check submitted documents",
                      "Move verification forward",
                    ],
                  ]
                : w === "manager"
                  ? [
                      [
                        "tasks",
                        "Prepare a warm welcome",
                        "Manage your team setup tasks",
                      ],
                      [
                        "team",
                        "Meet your new teammates",
                        "View the people in your scope",
                      ],
                      [
                        "onboarding",
                        "Review team progress",
                        "Understand what is blocking day one",
                      ],
                    ]
                  : [
                      [
                        "tasks",
                        "See your next steps",
                        "Review what needs your attention",
                      ],
                      [
                        "documents",
                        "Prepare your documents",
                        "Check outstanding requests",
                      ],
                      [
                        "training",
                        "Make time to learn",
                        "Explore your assigned courses",
                      ],
                    ]
              ).map(([path, title, subtitle], i) => (
                <Link key={path} to={`/${w}/${path}`}>
                  <span className="action-number">0{i + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{subtitle}</small>
                  </div>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </QueryState>
      <div className="principle-strip">
        <ShieldCheck size={19} />
        <span>
          <strong>AI proposes. People decide.</strong> Plans are checked against
          policies before authorized HR review.
        </span>
      </div>
    </>
  );
}
export function PlanTable({ rows }: { rows: Plan[] }) {
  const { user } = useSession();
  const w = workspaceFor(user!);
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Employee / journey</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Start date</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <Link
                  className="record-link"
                  to={`/${w}/${w === "hr" ? "plans" : "onboarding"}/${p.id}`}
                >
                  {p.employeeName}
                </Link>
                <small>
                  {p.jurisdictionCode} · {human(p.generationMode)}
                </small>
              </td>
              <td>
                <Badge value={p.status} />
              </td>
              <td>
                <Progress done={p.completedCount} total={p.taskCount} />
              </td>
              <td>{date(p.startDate)}</td>
              <td>
                <Link
                  aria-label={`Open plan for ${p.employeeName}`}
                  to={`/${w}/${w === "hr" ? "plans" : "onboarding"}/${p.id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No onboarding plans yet"
      text="Create an employee profile, then generate their onboarding plan from the employee record."
      action={
        can(user, "employee.create") ? (
          <Link className="button primary" to="/hr/employees/new">
            <Plus size={16} />
            Add employee
          </Link>
        ) : undefined
      }
    />
  );
}
export function Employees() {
  const { user } = useSession();
  const w = workspaceFor(user!);
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = useQuery({
    queryKey: ["employees", params.toString()],
    queryFn: () =>
      api.employees.list({
        page,
        pageSize: 12,
        search: params.get("search") ?? "",
        sort: params.get("sort") ?? "startDate",
        ...(params.get("departmentId")
          ? { departmentId: params.get("departmentId")! }
          : {}),
        ...(params.get("status") ? { status: params.get("status")! } : {}),
      }),
  });
  const base = `/${w}/${w === "hr" ? "employees" : "team"}`;
  return (
    <>
      <Heading
        title={w === "hr" ? "People directory" : "Your team"}
        description="The people behind every onboarding journey."
        actions={
          can(user, "employee.create") ? (
            <Link className="button primary" to={`${base}/new`}>
              <Plus size={16} />
              Add employee
            </Link>
          ) : undefined
        }
      />
      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search employees"
              placeholder="Search name or employee number"
              value={params.get("search") ?? ""}
              onChange={(e) =>
                setParams(
                  (p) => {
                    p.set("search", e.target.value);
                    p.delete("page");
                    return p;
                  },
                  { replace: true },
                )
              }
            />
          </label>
          <select
            aria-label="Filter employee status"
            value={params.get("status") ?? ""}
            onChange={(e) =>
              setParams((p) => {
                p.set("status", e.target.value);
                p.delete("page");
                return p;
              })
            }
          >
            <option value="">All statuses</option>
            {(
              [
                ["PRE_HIRE", "Pre-hire"],
                ["ONBOARDING", "Onboarding"],
                ["ACTIVE", "Active"],
                ["WITHDRAWN", "Withdrawn"],
              ] as const
            ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort employees"
            value={params.get("sort") ?? "startDate"}
            onChange={(e) =>
              setParams((p) => {
                p.set("sort", e.target.value);
                return p;
              })
            }
          >
            <option value="startDate">Start date ↑</option>
            <option value="-startDate">Start date ↓</option>
            <option value="lastName">Last name A–Z</option>
          </select>
        </div>
        <QueryState query={q}>
          {q.data?.items.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department & role</th>
                    <th>Location</th>
                    <th>Start date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="person">
                          <span className="avatar">
                            {e.firstName[0]}
                            {e.lastName[0]}
                          </span>
                          <div>
                            <Link
                              className="record-link"
                              to={`${base}/${e.id}`}
                            >
                              {e.firstName} {e.lastName}
                            </Link>
                            <small>{e.employeeNumber}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {e.departmentName ?? "Unassigned"}
                        <small>{e.jobTitle}</small>
                      </td>
                      <td>{e.jurisdictionCode}</td>
                      <td>{date(e.startDate)}</td>
                      <td>
                        <Badge value={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No matching employees"
              text="Try a different search or add an employee to get started."
            />
          )}
        </QueryState>
        <div className="pagination">
          <span>
            {q.data?.meta.totalItems ?? 0} employees · Page {page} of{" "}
            {q.data?.meta.totalPages ?? 1}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() =>
                setParams((p) => {
                  p.set("page", String(page - 1));
                  return p;
                })
              }
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Next page"
              disabled={page >= (q.data?.meta.totalPages ?? 1)}
              onClick={() =>
                setParams((p) => {
                  p.set("page", String(page + 1));
                  return p;
                })
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function CreateEmployee() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: api.reference.departments,
  });
  const locations = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: api.reference.jurisdictions,
  });
  const managers = useQuery({
    queryKey: ["manager-options"],
    queryFn: () => api.employees.list({ pageSize: 100, sort: "lastName" }),
  });
  const [validation, setValidation] = useState("");
  const create = useMutation({
    mutationFn: api.employees.create,
    onSuccess: (e) => {
      void cache.invalidateQueries();
      navigate(`/hr/employees/${e.id}`);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const data = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== ""),
    );
    const parsed = CreateEmployeeRequestSchema.safeParse({
      ...data,
      unionMember: raw.unionMember === "on",
    });
    if (!parsed.success) {
      setValidation(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
      return;
    }
    setValidation("");
    create.mutate(parsed.data);
  }
  return (
    <>
      <Heading
        title="Make room for someone new."
        description="Create an employee profile. Their role and location shape the onboarding plan."
      />
      <form onSubmit={submit}>
        <Panel
          title="Employee information"
          description="Fields marked * are required"
        >
          <div className="form-grid">
            {[
              ["firstName", "First name", "text"],
              ["lastName", "Last name", "text"],
              ["personalEmail", "Personal email", "email"],
              ["jobTitle", "Job title", "text"],
              ["roleFamily", "Role family", "text"],
              ["startDate", "Joining date", "date"],
            ].map(([name, label, type]) => (
              <label key={name}>
                {label} *
                <input
                  name={name}
                  type={type}
                  required
                  maxLength={name === "personalEmail" ? 254 : 120}
                />
              </label>
            ))}
            <label>
              Work identity email (optional)
              <input
                name="workEmail"
                type="text"
                placeholder="alex@clyora"
                autoComplete="off"
              />
              <small>Its username prefix is used in Keycloak. The activation email goes to the personal email above.</small>
            </label>
            <label>
              Department
              <select name="departmentId">
                <option value="">Not assigned</option>
                {departments.data?.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reporting manager
              <select name="managerId">
                <option value="">Not assigned</option>
                {managers.data?.items.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName} · {person.jobTitle}
                  </option>
                ))}
              </select>
              <small>Choose from the first 100 people in the directory.</small>
            </label>
            <label>
              Location *
              <select name="jurisdictionCode" required>
                <option value="">Select location</option>
                {locations.data?.map((d) => (
                  <option value={d.code} key={d.code}>
                    {d.displayName}
                    {!d.hasPolicyCorpus ? " — no policy coverage" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Employment type *
              <select name="employmentType" defaultValue="FULL_TIME">
                {(
                  [
                    ["FULL_TIME", "Full time"],
                    ["PART_TIME", "Part time"],
                    ["CONTRACTOR", "Contractor"],
                    ["INTERN", "Intern"],
                  ] as const
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Work arrangement *
              <select name="workMode" defaultValue="ONSITE">
                {(
                  [
                    ["ONSITE", "Onsite"],
                    ["HYBRID", "Hybrid"],
                    ["REMOTE", "Remote"],
                  ] as const
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-two">
              HR notes
              <textarea name="notes" maxLength={2000} rows={3} />
            </label>
            <label className="checkbox-label">
              <input name="unionMember" type="checkbox" />
              Union member
            </label>
          </div>
          {(departments.isError || locations.isError) && (
            <p className="notice danger">
              Reference data could not be loaded. Refresh this page before
              creating an employee.
            </p>
          )}
          <div className="form-footer">
            <div className="form-footer-messages">
              {validation && (
                <p role="alert" className="notice danger">
                  {validation}
                </p>
              )}
              <Feedback error={create.error} />
            </div>
            <div className="actions">
              <Link className="button secondary" to="/hr/employees">
                Cancel
              </Link>
              <button
                className="button primary"
                type="submit"
                disabled={
                  create.isPending || locations.isPending || locations.isError
                }
              >
                {create.isPending ? "Creating…" : "Create employee"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </Panel>
      </form>
    </>
  );
}
export function EmployeeDetails({ self = false }: { self?: boolean }) {
  const { employeeId } = useParams();
  const { user } = useSession();
  const id = self ? user?.employeeId : employeeId;
  const q = useQuery({
    queryKey: ["employee", id],
    queryFn: () => api.employees.get(id!),
    enabled: !!id,
  });
  const [job, setJob] = useState("");
  const [baseline, setBaseline] = useState(false);
  const [reason, setReason] = useState("");
  const cache = useQueryClient();
  const navigate = useNavigate();
  const w = workspaceFor(user!);
  const generate = useMutation({
    mutationFn: () => api.plans.generate(id!, { forceBaseline: baseline }),
    onSuccess: (r) => setJob(r.jobId),
  });
  const invite = useMutation({
    mutationFn: () => api.employees.invite(id!),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["employee", id] }),
  });
  const offboard = useMutation({
    mutationFn: () => api.employees.offboard(id!, { reason }),
    onSuccess: () => {
      setReason("");
      void cache.invalidateQueries();
    },
  });
  const state = useQuery({
    queryKey: ["job", job],
    queryFn: () => api.jobs.get(job),
    enabled: !!job,
    refetchInterval: (q) =>
      ["SUCCEEDED", "FAILED"].includes(q.state.data?.status ?? "")
        ? false
        : 1500,
  });
  if (!id)
    return (
      <Empty
        title="No linked employee profile"
        text="Ask your HR administrator to link your account to an employee record."
      />
    );
  const e = q.data;
  return (
    <>
      <Heading
        title={
          self
            ? "My profile"
            : e
              ? `${e.firstName} ${e.lastName}`
              : "Employee details"
        }
        description={
          e
            ? `${e.employeeNumber} · ${e.jobTitle}`
            : "Profile, employment information and next steps."
        }
      />
      <QueryState query={q}>
        {e && (
          <div className="detail-grid">
            <Panel title="Employment details">
              <dl className="detail-list">
                {[
                  ["Status", human(e.status)],
                  ["Department", e.departmentName],
                  ["Location", e.jurisdictionCode],
                  ["Joining date", date(e.startDate)],
                  ["Manager", e.managerName],
                  ["Work arrangement", human(e.workMode)],
                  ["Employment type", human(e.employmentType)],
                  ["Personal email", e.personalEmail],
                  ["Work email", e.workEmail],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v ?? "Not assigned"}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <div>
              {can(user, "employee.invite") && (
                <Panel
                  title="Employee portal access"
                  description="Create or match their Keycloak account and email a one-time link to verify their address and choose a password."
                >
                  <div className="panel-body form-vertical">
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
                      The activation link goes to {e.personalEmail}. No password is generated or shared by HR.
                    </p>
                    <button
                      className="button primary"
                      disabled={invite.isPending}
                      onClick={() => invite.mutate()}
                      style={{ alignSelf: "flex-start" }}
                    >
                      {invite.isPending ? "Generating activation link…" : "Send employee activation link"}
                    </button>
                    <Feedback
                      error={invite.error}
                      success={
                        invite.isSuccess
                          ? invite.data.activationEmailSent
                            ? `Activation email sent to ${invite.data.email}. The link expires in 7 days.`
                            : `Employee account provisioned! Activation link ready.`
                          : undefined
                      }
                    />
                    {invite.isSuccess && invite.data.inviteUrl && (
                      <div className="active-plan-card" style={{ marginTop: "8px", wordBreak: "break-all" }}>
                        <span className="field-label" style={{ fontSize: "12px", color: "var(--ink)" }}>
                          One-time activation link:
                        </span>
                        <a
                          href={invite.data.inviteUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--primary)", fontSize: "13px", fontWeight: 600, textDecoration: "underline" }}
                        >
                          {invite.data.inviteUrl}
                        </a>
                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--muted)" }}>
                          The employee can open this link to set their password, or sign in directly with Keycloak SSO once verified.
                        </p>
                      </div>
                    )}
                  </div>
                </Panel>
              )}
              <Panel
                title="Onboarding journey"
                description="A plan connects the employee to the right work."
              >
                <div className="panel-body form-vertical">
                  {e.activePlanId ? (
                    <div className="active-plan-card">
                      <div className="active-plan-header">
                        <span className="badge" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}>
                          Active plan available
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 10px", fontSize: "13px", color: "var(--muted)" }}>
                        An onboarding plan is currently active for this employee.
                      </p>
                      <Link
                        className="button primary"
                        to={`/${w}/${w === "hr" ? "plans" : "onboarding"}/${e.activePlanId}`}
                        style={{ alignSelf: "flex-start" }}
                      >
                        Open active plan <ArrowRight size={16} />
                      </Link>
                    </div>
                  ) : (
                    <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: "13px" }}>
                      No active plan has been generated yet.
                    </p>
                  )}
                  {can(user, "plan.generate") && (
                    <div className="generate-plan-section">
                      <h4 className="section-title">
                        {e.activePlanId ? "Regenerate onboarding plan" : "Generate onboarding plan"}
                      </h4>
                      <p style={{ margin: "2px 0 8px", color: "var(--muted)", fontSize: "13px" }}>
                        Synthesizes role-based tasks, compliance dependencies, and jurisdiction statutory rules.
                      </p>
                      <label className="checkbox-label" style={{ margin: "6px 0 12px" }}>
                        <input
                          type="checkbox"
                          checked={baseline}
                          onChange={(e) => setBaseline(e.target.checked)}
                        />
                        <span>Use policy templates only (skip AI)</span>
                      </label>
                      <button
                        className={`button ${e.activePlanId ? "secondary" : "primary"}`}
                        disabled={generate.isPending || !!job}
                        onClick={() => generate.mutate()}
                        style={{ alignSelf: "flex-start" }}
                      >
                        {generate.isPending
                          ? "Starting…"
                          : "Generate onboarding plan"}
                      </button>
                      <Feedback error={generate.error} />
                    </div>
                  )}
                  {job && (
                    <div className="notice" style={{ marginTop: "14px" }}>
                      <QueryState query={state}>
                        <strong>{human(state.data?.status)}</strong>
                        <p>{state.data?.error ?? human(state.data?.stage)}</p>
                        <progress
                          max={100}
                          value={state.data?.progressPercent ?? 0}
                        />
                        {state.data?.resultUrl && (
                          <button
                            className="button secondary"
                            onClick={() =>
                              navigate(
                                `/${w}/${w === "hr" ? "plans" : "onboarding"}/${state.data!.resultUrl!.split("/").pop()}`,
                              )
                            }
                          >
                            View generated plan
                          </button>
                        )}
                      </QueryState>
                    </div>
                  )}
                </div>
              </Panel>
              {can(user, "employee.update") && (
                <Panel
                  title="Offboarding"
                  description="Record departure and initiate the existing offboarding workflow."
                >
                  <form
                    className="panel-body form-vertical"
                    onSubmit={(event) => {
                      event.preventDefault();
                      offboard.mutate();
                    }}
                  >
                    <label className="form-field">
                      <span className="field-label">Departure reason <span className="field-required">*</span></span>
                      <textarea
                        required
                        minLength={3}
                        rows={3}
                        placeholder="e.g. Voluntary resignation, end of contract, relocation..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <div className="form-actions" style={{ marginTop: "4px" }}>
                      <button
                        className="button secondary danger-hover"
                        disabled={offboard.isPending}
                      >
                        {offboard.isPending ? "Starting offboarding…" : "Start offboarding"}
                      </button>
                    </div>
                    <Feedback
                      error={offboard.error}
                      success={
                        offboard.isSuccess
                          ? "Offboarding request saved."
                          : undefined
                      }
                    />
                  </form>
                </Panel>
              )}
            </div>
          </div>
        )}
      </QueryState>
    </>
  );
}
export function Plans({ approvals = false }: { approvals?: boolean }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = useQuery({
    queryKey: ["plans", params.toString(), approvals],
    queryFn: () =>
      api.plans.list({
        page,
        pageSize: 20,
        ...(params.get("status") ? { status: params.get("status")! } : {}),
      }),
  });
  const rows = approvals
    ? q.data?.items.filter((p) =>
        ["DRAFT", "AWAITING_APPROVAL", "AWAITING_COMPLETION_APPROVAL"].includes(p.status),
      )
    : q.data?.items;
  return (
    <>
      <Heading
        title={
          approvals ? "Decisions that move people forward." : "Onboarding plans"
        }
        description={
          approvals
            ? "Review drafts and pending approvals on this page. Open a plan to inspect tasks and findings."
            : "One place for policy-backed tasks, shared ownership and progress."
        }
      />
      <section className="panel">
        <div className="toolbar">
          <span className="table-label">
            {approvals ? "Review queue" : "All accessible journeys"}
          </span>
          <select
            aria-label="Plan status"
            value={params.get("status") ?? ""}
            onChange={(e) => setParams({ status: e.target.value })}
          >
            <option value="">All statuses</option>
            {[
              "DRAFT",
              "AWAITING_APPROVAL",
              "APPROVED",
              "IN_PROGRESS",
              "AWAITING_COMPLETION_APPROVAL",
              "COMPLETED",
              "REFUSED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="Refresh plans"
            title={q.isFetching ? "Refreshing plans…" : "Refresh plans"}
            disabled={q.isFetching}
            onClick={() => q.refetch()}
          >
            <RefreshCw size={17} className={q.isFetching ? "spinning" : ""} />
          </button>
        </div>
        <QueryState query={q}>
          <PlanTable rows={rows ?? []} />
        </QueryState>
        <div className="pagination">
          <span>
            Page {page} of {q.data?.meta.totalPages ?? 1}
          </span>
          <div>
            <button
              className="button secondary"
              disabled={page === 1}
              onClick={() =>
                setParams((p) => {
                  p.set("page", String(page - 1));
                  return p;
                })
              }
            >
              Previous
            </button>
            <button
              className="button secondary"
              disabled={page >= (q.data?.meta.totalPages ?? 1)}
              onClick={() =>
                setParams((p) => {
                  p.set("page", String(page + 1));
                  return p;
                })
              }
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function TaskRows({
  tasks,
  review = false,
}: {
  tasks: PlanTask[];
  review?: boolean;
}) {
  const { user } = useSession();
  const cache = useQueryClient();
  const update = useMutation({
    mutationFn: ({
      t,
      reviewState,
    }: {
      t: PlanTask;
      reviewState: "OK" | "NEEDS_REVIEW";
    }) =>
      api.plans.updateTask(t.planId, t.id, {
        reviewState,
        reason: "Task reviewed in plan workspace",
      }),
    onSuccess: () => void cache.invalidateQueries(),
  });
  return (
    <>
      <Feedback error={update.error} />
      {tasks.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Task & context</th>
                <th>Owner</th>
                <th>Due date</th>
                <th>Status</th>
                <th>Next action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                    <small>
                      {human(t.service)} · {t.dependsOn.length} dependencies
                    </small>
                    {t.description && (
                      <details>
                        <summary>Details & policy sources</summary>
                        <p>{t.description}</p>
                        {t.citations.map((c) => (
                          <blockquote key={c.id}>
                            {c.quotedText}
                            <small>
                              {c.documentTitle} · {c.clauseId}
                              {c.isMock ? " · Demo policy" : ""}
                            </small>
                          </blockquote>
                        ))}
                        {t.riskReason && (
                          <p className="notice warning">{t.riskReason}</p>
                        )}
                      </details>
                    )}
                  </td>
                  <td>{human(t.ownerRole)}</td>
                  <td>{date(t.dueDate)}</td>
                  <td>
                    <Badge value={t.status} />
                  </td>
                  <td>
                    {review && can(user, "plan.approve") ? (
                      <button
                        className="button secondary small"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            t,
                            reviewState:
                              t.reviewState === "OK" ? "NEEDS_REVIEW" : "OK",
                          })
                        }
                      >
                        {update.isPending && update.variables?.t.id === t.id
                          ? "Saving…"
                          : t.reviewState === "OK"
                          ? "Reopen review"
                          : "Mark reviewed"}
                      </button>
                    ) : t.status === "COMPLETED" || t.status === "SKIPPED" ? (
                      <Badge value={t.reviewState} />
                    ) : workspaceFor(user!) === "manager" && t.service === "MANAGER" ? (
                      <Link className="button secondary small" to="/manager/tasks">Open manager task</Link>
                    ) : workspaceFor(user!) === "employee" && ["DOCUMENTS", "TRAINING", "BENEFITS"].includes(t.service) ? (
                      <Link className="button secondary small" to={`/employee/${t.service.toLowerCase() === "documents" ? "documents" : t.service.toLowerCase()}`}>Continue task</Link>
                    ) : workspaceFor(user!) === "hr" ? (
                      <Link className="button secondary small" to={`/hr/${({ DOCUMENTS: "documents", EQUIPMENT: "equipment", PAYROLL: "payroll", BENEFITS: "benefits", TRAINING: "training", MANAGER: "manager-tasks" } as Record<string, string>)[t.service] ?? "tasks"}`}>Open owner queue</Link>
                    ) : (
                      <span className="muted">Owned by {human(t.ownerRole)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No tasks found" />
      )}
    </>
  );
}
export function Tasks() {
  const [params, setParams] = useSearchParams();
  const q = useQuery({
    queryKey: ["tasks", params.toString()],
    queryFn: () =>
      api.tasks.list({
        pageSize: 100,
        ...(params.get("status") ? { status: params.get("status")! } : {}),
      }),
  });
  const search = (params.get("search") ?? "").toLowerCase();
  const items =
    q.data?.items.filter((t) => t.title.toLowerCase().includes(search)) ?? [];
  return (
    <>
      <Heading
        title="Work that moves onboarding forward."
        description="Review up to 100 tasks. Complete service-specific work in Documents, Training, Benefits or Manager tasks."
      />
      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search tasks"
              placeholder="Search loaded tasks"
              value={params.get("search") ?? ""}
              onChange={(e) =>
                setParams(
                  (p) => {
                    p.set("search", e.target.value);
                    return p;
                  },
                  { replace: true },
                )
              }
            />
          </label>
          <select
            aria-label="Task status"
            value={params.get("status") ?? ""}
            onChange={(e) =>
              setParams((p) => {
                p.set("status", e.target.value);
                return p;
              })
            }
          >
            <option value="">All statuses</option>
            {[
              "NOT_STARTED",
              "IN_PROGRESS",
              "BLOCKED",
              "COMPLETED",
              "SKIPPED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <QueryState query={q}>
          <TaskRows tasks={items} />
        </QueryState>
      </section>
    </>
  );
}
export function PlanDetails() {
  const { planId } = useParams();
  const { user } = useSession();
  const cache = useQueryClient();
  const [tab, setTab] = useState("Tasks");
  const [ack, setAck] = useState(false);
  const [finalAck, setFinalAck] = useState(false);
  const [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => api.plans.get(planId!),
  });
  const findings = useQuery({
    queryKey: ["findings", planId],
    queryFn: () => api.plans.findings(planId!),
    enabled: tab === "Findings" && can(user, "finding.read"),
  });
  const graph = useQuery({
    queryKey: ["graph", planId],
    queryFn: () => api.plans.graph(planId!),
    enabled: tab === "Dependencies",
  });
  const pack = useQuery({
    queryKey: ["pack", planId],
    queryFn: () => api.plans.pack(planId!),
    enabled: tab === "IT pack",
  });
  const approval = useMutation({
    mutationFn: (decision: "APPROVE" | "REJECT") =>
      api.plans.approve(planId!, { decision, acknowledgement: true, reason }),
    onSuccess: () => {
      setAck(false);
      void cache.invalidateQueries();
    },
  });
  const finalize = useMutation({
    mutationFn: () => api.plans.finalize(planId!, reason.trim() || undefined),
    onSuccess: () => {
      setFinalAck(false);
      void cache.invalidateQueries();
    },
  });
  const p = q.data;
  return (
    <>
      <Heading
        title={p ? `${p.employeeName}’s onboarding` : "Onboarding plan"}
        description="Review the work, understand the dependencies and move forward with clarity."
      />
      <QueryState query={q}>
        {p && (
          <>
            <div className="record-summary">
              <Badge value={p.status} />
              <span>{p.jurisdictionCode}</span>
              <span>Joining {date(p.startDate)}</span>
              <span>{human(p.generationMode)}</span>
              <Progress done={p.completedCount} total={p.taskCount} />
            </div>
            {p.refusalReason && (
              <p className="notice danger">{p.refusalReason}</p>
            )}
            {p.degradedReason && (
              <p className="notice warning">{p.degradedReason}</p>
            )}
            {p.status === "AWAITING_COMPLETION_APPROVAL" && (
              <p className="notice" role="status">
                Your onboarding tasks are complete. HR is reviewing the final sign-off; no further action is needed from you right now.
              </p>
            )}
            {p.status === "COMPLETED" && user?.roles.includes("employee") && (
              <p className="notice" role="status">
                Your onboarding is complete. HR has approved your final sign-off.
              </p>
            )}
            {workspaceFor(user!) === "manager" && (
              <p className="notice" role="status">
                This is the full team journey. Your manager-owned actions and due dates are in <Link to="/manager/tasks">Manager tasks</Link>. IT-owned laptop and account work is handled by the IT queue; you can follow its status here.
              </p>
            )}
            {workspaceFor(user!) === "employee" && (
              <p className="notice" role="status">
                This page shows your complete onboarding plan. Complete items assigned to you from My tasks, Documents, Training, and Benefits. Your manager and IT will update their own tasks.
              </p>
            )}
            <div className="tabs" role="tablist" aria-label="Plan sections">
              {[
                "Tasks",
                ...(can(user, "finding.read") ? ["Findings"] : []),
                "Dependencies",
                ...(can(user, "plan.approve") ? ["IT pack"] : []),
              ].map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                  className={tab === t ? "active" : ""}
                >
                  {t}
                  {t === "Tasks" && <span>{p.taskCount}</span>}
                </button>
              ))}
            </div>
            <div className="panel">
              {tab === "Tasks" && (
                <TaskRows
                  tasks={p.tasks}
                  review={["DRAFT", "AWAITING_APPROVAL"].includes(p.status)}
                />
              )}
              {tab === "Findings" && (
                <QueryState query={findings}>
                  {findings.data?.items.length ? (
                    <div className="finding-list">
                      {findings.data.items.map((f) => (
                        <article key={f.id}>
                          <Badge value={f.severity} />
                          <h3>{f.code}</h3>
                          <p>{f.message}</p>
                          <small>
                            {f.validator} · {human(f.action)}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="No validation findings"
                      text="No findings were returned for this plan."
                    />
                  )}
                </QueryState>
              )}
              {tab === "Dependencies" && (
                <QueryState query={graph}>
                  <div className="dependency-list">
                    {graph.data?.nodes.map((n) => (
                      <article key={n.id}>
                        <span className="action-number">{n.depth + 1}</span>
                        <div>
                          <strong>{n.title}</strong>
                          <p>
                            {graph.data.edges
                              .filter((e) => e.to === n.id)
                              .map(
                                (e) =>
                                  graph.data!.nodes.find((v) => v.id === e.from)
                                    ?.title,
                              )
                              .join(" → ") || "No prerequisites"}
                          </p>
                        </div>
                        <Badge value={n.status} />
                      </article>
                    ))}
                  </div>
                </QueryState>
              )}
              {tab === "IT pack" && (
                <QueryState query={pack}>
                  <div className="panel-body">
                    <h2>Generated onboarding artifacts</h2>
                    <p>
                      Review generated content before any manual use. This view
                      does not execute scripts.
                    </p>
                    <pre className="code-preview">
                      {JSON.stringify(pack.data, null, 2)}
                    </pre>
                  </div>
                </QueryState>
              )}
            </div>
            {can(user, "plan.approve") &&
              ["DRAFT", "AWAITING_APPROVAL"].includes(p.status) && (
                <Panel
                  title="Review & decision"
                  description="Resolve outstanding task reviews before approving. Approval authorizes workflow dispatch."
                >
                  <div className="panel-body form-vertical">
                    <label className="form-field">
                      <span className="field-label">Decision notes</span>
                      <textarea
                        value={reason}
                        maxLength={500}
                        rows={3}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Explain the approval decision, or specify changes required if rejecting..."
                      />
                      <small className="field-hint">Required when rejecting a plan. Optional for approvals.</small>
                    </label>
                    <label className="checkbox-label" style={{ margin: "4px 0 12px" }}>
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      <span>
                        I have reviewed this plan and accept responsibility for
                        this decision.
                      </span>
                    </label>
                    <Feedback
                      error={approval.error}
                      success={
                        approval.isSuccess ? "Decision saved." : undefined
                      }
                    />
                    <div className="actions" style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
                      <button
                        className="button secondary button-danger-outline"
                        disabled={!ack || !reason.trim() || approval.isPending}
                        onClick={() => approval.mutate("REJECT")}
                      >
                        {approval.isPending && approval.variables === "REJECT"
                          ? "Saving decision…"
                          : "Reject plan"}
                      </button>
                      <button
                        className="button primary"
                        disabled={!ack || approval.isPending}
                        onClick={() => approval.mutate("APPROVE")}
                      >
                        <FileCheck2 size={16} />
                        {approval.isPending
                          ? approval.variables === "APPROVE" ? "Approving & dispatching…" : "Saving decision…"
                          : "Approve & dispatch"}
                      </button>
                    </div>
                  </div>
                </Panel>
              )}
            {can(user, "plan.approve") && p.status === "AWAITING_COMPLETION_APPROVAL" && (
              <Panel
                title="Final onboarding sign-off"
                description="All journey tasks are complete. HR reviews the final record here before the employee is marked active."
              >
                <div className="panel-body form-vertical">
                  <p>Confirm the employee’s onboarding work is complete and any remaining items are intentionally skipped.</p>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={finalAck} onChange={(event) => setFinalAck(event.target.checked)} />
                    <span>I reviewed the completed onboarding and approve final sign-off.</span>
                  </label>
                  <Feedback error={finalize.error} success={finalize.isSuccess ? "Final sign-off saved. The employee is now active." : undefined} />
                  <button className="button primary" disabled={!finalAck || finalize.isPending} onClick={() => finalize.mutate()}>
                    {finalize.isPending ? "Saving final approval…" : "Approve completed onboarding"}
                  </button>
                </div>
              </Panel>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}
