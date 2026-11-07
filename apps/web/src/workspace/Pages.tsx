import { useEffect, useState, type FormEvent } from "react";
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
  MapPin,
  Calendar,
  Sparkles,
  CheckCircle2,
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
  cleanDisplayName,
  cleanDisplayDescription,
} from "./ui";

export function Dashboard() {
  const { user } = useSession();
  const w = workspaceFor(user!);
  const plans = useQuery({
    queryKey: ["plans", "overview"],
    queryFn: () => api.plans.list({ pageSize: 100 }),
    refetchInterval: 5000,
  });
  const people = useQuery({
    queryKey: ["people", "count"],
    queryFn: () => api.employees.list({ pageSize: 50 }),
    // Roles without employee.read should not fire an API request they are
    // expected to be denied. This also keeps employee dashboards clean.
    enabled: can(user, "employee.read"),
    refetchInterval: can(user, "employee.read") ? 5000 : false,
  });
  const rows = plans.data?.items ?? [];
  const directReports = (people.data?.items ?? []).filter(
    (employee) => employee.id !== user?.employeeId,
  );
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
            label={
              w === "hr"
                ? "Awaiting review"
                : w === "manager"
                  ? "Direct reports"
                  : "People in scope"
            }
            value={
              w === "hr"
                ? review.length
                : w === "manager"
                  ? directReports.length
                : !can(user, "employee.read")
                  ? "—"
                  : people.isError
                  ? "Unavailable"
                  : (people.data?.meta.totalItems ?? "—")
            }
            detail={
              w === "hr"
                ? "Draft and pending approval plans"
                : w === "manager"
                  ? "Employees reporting to you"
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
        {w === "manager" && (
          <Panel
            title="Your direct reports"
            description="New employees appear here as soon as HR assigns you as their manager."
          >
            {people.isPending ? (
              <div className="loading" role="status"><span className="spinner" />Loading your team…</div>
            ) : directReports.length ? (
              <div className="team-progress-list">
                {directReports.map((employee) => (
                  <Link
                    key={employee.id}
                    className="team-progress-row"
                    to={`/manager/team/${employee.id}`}
                  >
                    <span>
                      <strong>{employee.firstName} {employee.lastName}</strong>
                      <small>{employee.jobTitle} · {employee.employeeNumber}</small>
                    </span>
                    <span>
                      <Badge value={employee.latestPlanStatus ?? employee.status} />
                      <small>{employee.latestPlanStatus ? human(employee.latestPlanStatus) : "Waiting for HR to generate the plan"}</small>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty title="No direct reports yet" text="When HR creates a profile and assigns you as manager, the employee will appear here." />
            )}
          </Panel>
        )}
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
      title={w === "manager" ? "No team onboarding plans yet" : "No onboarding plans yet"}
      text={
        w === "manager"
          ? "Plans appear here after HR assigns an employee to you as their manager, generates the onboarding plan, and approves it. If you expected a plan, ask HR to check the employee’s Manager field and plan approval status."
          : "Create an employee profile, then generate their onboarding plan from the employee record."
      }
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
    refetchInterval: 5000,
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
              title={w === "manager" ? "No direct reports assigned yet" : "No matching employees"}
              text={
                w === "manager"
                  ? "HR needs to select your manager account in each employee profile’s Manager field. Once assigned, your direct reports will appear here."
                  : "Try a different search or add an employee to get started."
              }
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
    queryFn: api.employees.managers,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });
  const [selectedManagerId, setSelectedManagerId] = useState("");
  // Do not render cached manager options from an earlier database/session.
  // The API returns only linked CLYORA manager accounts; use the list only
  // after this page has confirmed it with a fresh request.
  const managerOptions = managers.isFetchedAfterMount && managers.isSuccess
    ? managers.data
    : [];
  const managerSelection = managerOptions.some((manager) => manager.id === selectedManagerId)
    ? selectedManagerId
    : managerOptions.length === 1
      ? managerOptions[0].id
      : "";
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
      managerId: managerSelection || undefined,
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
              <small>Employees use this CLYORA identity to sign in with Keycloak. The activation email goes to the personal email above.</small>
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
              Reporting manager *
              <select
                name="managerId"
                required
                value={managerSelection}
                onChange={(event) => setSelectedManagerId(event.target.value)}
                disabled={!managers.isFetchedAfterMount || managers.isError || !managerOptions.length}
              >
                <option value="">Select a manager</option>
                {managerOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName} · {person.jobTitle} ({person.email})
                  </option>
                ))}
              </select>
              <small>
                {!managers.isFetchedAfterMount && !managers.isError
                  ? "Refreshing linked manager accounts…"
                  : managers.isError
                    ? "Manager accounts could not be loaded. Retry before creating the employee."
                    : managerOptions.length
                      ? "The employee will appear in this manager’s team as soon as the profile is created."
                      : "No linked manager account is available. Link David’s manager account before creating an employee."}
              </small>
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
          {(departments.isError || locations.isError || managers.isError || managers.isFetchedAfterMount && !managerOptions.length) && (
            <p className="notice danger">
              {managers.isError || managers.isFetchedAfterMount && !managerOptions.length
                ? "A linked manager account is required. Confirm David Chen has the manager role and an employee profile, then refresh."
                : "Reference data could not be loaded. Refresh this page before creating an employee."}
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
                  || !managers.isFetchedAfterMount || managers.isError || !managerOptions.length
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
    refetchInterval: 5000,
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
  useEffect(() => {
    if (state.data?.status !== "SUCCEEDED" || !id) return;
    void cache.invalidateQueries({ queryKey: ["employee", id] });
    void cache.invalidateQueries({ queryKey: ["employees"] });
    void cache.invalidateQueries({ queryKey: ["people"] });
    void cache.invalidateQueries({ queryKey: ["plans"] });
    void cache.invalidateQueries({ queryKey: ["work-queue-plans"] });
    setJob("");
  }, [cache, id, state.data?.status]);
  const journeyPlanId = q.data?.activePlanId ?? q.data?.latestPlanId ?? null;
  const planJobActive = !!job && !["SUCCEEDED", "FAILED"].includes(state.data?.status ?? "");
  const journeyPlan = useQuery({
    queryKey: ["plan", journeyPlanId],
    queryFn: () => api.plans.get(journeyPlanId!),
    enabled: !!journeyPlanId,
    refetchInterval: (query) =>
      query.state.data?.status === "COMPLETED" || query.state.data?.status === "REFUSED"
        ? false
        : 4000,
  });
  if (!id)
    return (
      <Empty
        title="No linked employee profile"
        text="Ask your HR administrator to link your account to an employee record."
      />
    );
  const e = q.data;
  const displayedPlanId = journeyPlanId;
  const journeyStatus = journeyPlan.data?.status ?? e?.latestPlanStatus ?? null;
  const journeySteps = [
    { label: "Profile created", done: true },
    {
      label: "Plan approved",
      done: ["APPROVED", "IN_PROGRESS", "AWAITING_COMPLETION_APPROVAL", "COMPLETED"].includes(journeyStatus ?? ""),
    },
    {
      label: "Onboarding tasks",
      done: ["AWAITING_COMPLETION_APPROVAL", "COMPLETED"].includes(journeyStatus ?? ""),
    },
    { label: "HR sign-off", done: journeyStatus === "COMPLETED" },
  ];
  const currentJourneyStep = journeyStatus === "COMPLETED"
    ? journeySteps.length
    : journeyStatus === "AWAITING_COMPLETION_APPROVAL"
      ? 3
      : ["APPROVED", "IN_PROGRESS"].includes(journeyStatus ?? "")
        ? 2
        : 1;
  const totalJourneyTasks = journeyPlan.data?.taskCount ?? 0;
  const completedJourneyTasks = journeyPlan.data?.completedCount ?? 0;
  const journeyPercent = journeyStatus === "COMPLETED"
    ? 100
    : totalJourneyTasks
      ? Math.round((completedJourneyTasks / totalJourneyTasks) * 100)
      : 0;
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
                description="The same milestones and task completion are visible to HR, the manager, and the employee."
              >
                <div className="panel-body form-vertical">
                  <section aria-label="Employee onboarding progress" className="employee-journey-progress">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <strong>{journeyStatus ? human(journeyStatus) : "Profile created"}</strong>
                      <span className="badge">Step {currentJourneyStep} of {journeySteps.length}</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Onboarding task completion"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={journeyPercent}
                      style={{ height: 8, background: "var(--border)", borderRadius: 999, overflow: "hidden", marginTop: 10 }}
                    >
                      <div style={{ width: `${journeyPercent}%`, height: "100%", background: "var(--primary)", transition: "width 250ms ease" }} />
                    </div>
                    <small style={{ color: "var(--muted)" }}>
                      {displayedPlanId
                        ? `${completedJourneyTasks} of ${totalJourneyTasks} onboarding tasks completed`
                        : "Waiting for HR to generate and approve the onboarding plan"}
                    </small>
                    <ol style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 8, listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                      {journeySteps.map((step, index) => {
                        const isCurrent = !step.done && index + 1 === currentJourneyStep;
                        return (
                          <li key={step.label} aria-current={isCurrent ? "step" : undefined} style={{ display: "flex", alignItems: "center", gap: 7, color: step.done ? "#15803d" : isCurrent ? "var(--primary)" : "var(--muted)", fontSize: 12, fontWeight: isCurrent ? 700 : 600 }}>
                            <span aria-hidden="true" style={{ width: 20, height: 20, display: "inline-grid", placeItems: "center", flex: "0 0 20px", borderRadius: "50%", border: `1px solid ${step.done ? "#86efac" : isCurrent ? "var(--primary)" : "var(--border)"}`, background: step.done ? "#f0fdf4" : "white" }}>
                              {step.done ? "✓" : index + 1}
                            </span>
                            {step.label}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                  {displayedPlanId ? (
                    <div className="active-plan-card">
                      <div className="active-plan-header">
                        <span className="badge" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}>
                          {journeyStatus === "COMPLETED"
                            ? "Onboarding completed"
                            : "Onboarding plan available"}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 10px", fontSize: "13px", color: "var(--muted)" }}>
                        {journeyStatus === "COMPLETED"
                          ? "HR has completed final sign-off. The employee journey is complete."
                          : `Current stage: ${human(journeyStatus ?? "DRAFT")}. Plan tasks and progress are available.`}
                      </p>
                      <Link
                        className="button primary"
                        to={`/${w}/${w === "hr" ? "plans" : "onboarding"}/${displayedPlanId}`}
                        style={{ alignSelf: "flex-start" }}
                      >
                        {journeyStatus === "COMPLETED"
                          ? "View completed journey"
                          : "Open onboarding plan"} <ArrowRight size={16} />
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
                        disabled={generate.isPending || planJobActive}
                        onClick={() => generate.mutate()}
                        style={{ alignSelf: "flex-start" }}
                      >
                        {generate.isPending
                          ? "Starting…"
                          : planJobActive
                            ? "Generating plan…"
                            : state.data?.status === "FAILED"
                              ? "Try plan generation again"
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
                  description="Remove portal access and record the departure. The employee record stays in the directory for audit history."
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
                          ? "Access revoked and status set to Withdrawn. The record remains available for audit history."
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
    refetchInterval: 5000,
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
const roleHelper = (role: string) => {
  const r = (role || "").toLowerCase();
  if (r === "hr" || r === "hr_admin") return { label: "HR Operations", cls: "role-hr" };
  if (r === "it" || r === "it_admin") return { label: "IT Support", cls: "role-it" };
  if (r === "manager") return { label: "Manager", cls: "role-manager" };
  if (r === "employee") return { label: "Employee", cls: "role-employee" };
  return { label: human(role), cls: "role-hr" };
};

const getHrAction = (service: string) => {
  switch ((service || "").toUpperCase()) {
    case "DOCUMENTS":
      return { path: "/hr/documents", label: "Review documents" };
    case "EQUIPMENT":
      return { path: "/hr/equipment", label: "Fulfill hardware" };
    case "PAYROLL":
      return { path: "/hr/payroll", label: "Payroll setup" };
    case "BENEFITS":
      return { path: "/hr/benefits", label: "Manage benefits" };
    case "TRAINING":
      return { path: "/hr/training", label: "Training modules" };
    case "MANAGER":
      return { path: "/hr/manager-tasks", label: "Manager milestones" };
    default:
      return { path: "/hr/tasks", label: "Open owner queue" };
  }
};

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
              {tasks.map((t) => {
                const role = roleHelper(t.ownerRole);
                const hrAction = getHrAction(t.service);
                const prereqCount = t.dependsOn?.length ?? 0;
                return (
                  <tr key={t.id}>
                    <td>
                      <strong style={{ display: "block", fontSize: "13.5px", marginBottom: "3px" }}>
                        {cleanDisplayName(t.title)}
                      </strong>
                      <small style={{ color: "var(--muted)", fontSize: "12px" }}>
                        {human(t.service)} · {prereqCount === 0 ? "No prerequisites" : `${prereqCount} prerequisite${prereqCount > 1 ? "s" : ""}`}
                      </small>
                      {t.description && (
                        <details className="task-context-details">
                          <summary>Details & policy sources</summary>
                          <div className="task-context-body">
                            <p style={{ margin: "0 0 8px", color: "#334155", lineHeight: "1.5" }}>
                              {cleanDisplayDescription(t.description)}
                            </p>
                            {t.citations.map((c) => (
                              <div key={c.id} className="task-citation-card">
                                <div style={{ fontStyle: "italic", marginBottom: "4px" }}>"{c.quotedText}"</div>
                                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
                                  {c.documentTitle} · {c.clauseId}
                                  {c.isMock ? " · Sample policy (illustrative)" : ""}
                                </div>
                              </div>
                            ))}
                            {t.riskReason && (
                              <p className="notice warning" style={{ marginTop: "8px", fontSize: "12px" }}>
                                {t.riskReason}
                              </p>
                            )}
                          </div>
                        </details>
                      )}
                    </td>
                    <td>
                      <span className={`role-badge ${role.cls}`}>{role.label}</span>
                    </td>
                    <td style={{ fontSize: "13px", color: "#475569", whiteSpace: "nowrap" }}>
                      {date(t.dueDate)}
                    </td>
                    <td>
                      <Badge value={t.status} />
                    </td>
                    <td>
                      {review && can(user, "plan.approve") ? (
                        <button
                          className={`button small ${t.reviewState === "OK" ? "secondary" : "primary"}`}
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              t,
                              reviewState:
                                t.reviewState === "OK" ? "NEEDS_REVIEW" : "OK",
                            })
                          }
                          style={{ fontSize: "12px", gap: "4px" }}
                        >
                          {update.isPending && update.variables?.t.id === t.id ? (
                            "Saving…"
                          ) : t.reviewState === "OK" ? (
                            <>
                              <CheckCircle2 size={13} color="#16a34a" /> Reviewed
                            </>
                          ) : (
                            "Mark reviewed"
                          )}
                        </button>
                      ) : t.status === "COMPLETED" || t.status === "SKIPPED" ? (
                        <Badge value={t.reviewState} />
                      ) : workspaceFor(user!) === "manager" && t.service === "MANAGER" ? (
                        <Link className="action-btn-styled" to="/manager/tasks">
                          Open manager task <ArrowRight size={13} />
                        </Link>
                      ) : workspaceFor(user!) === "employee" && ["DOCUMENTS", "TRAINING", "BENEFITS"].includes(t.service) ? (
                        <Link
                          className="action-btn-styled"
                          to={`/employee/${t.service.toLowerCase() === "documents" ? "documents" : t.service.toLowerCase()}`}
                        >
                          Continue task <ArrowRight size={13} />
                        </Link>
                      ) : workspaceFor(user!) === "hr" ? (
                        <Link className="action-btn-styled" to={hrAction.path}>
                          {hrAction.label} <ArrowRight size={13} />
                        </Link>
                      ) : (
                        <span className="muted" style={{ fontSize: "12px" }}>Assigned to {role.label}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
  const plans = useQuery({
    queryKey: ["work-queue-plans"],
    queryFn: () => api.plans.list({ pageSize: 100 }),
    refetchInterval: 5000,
  });
  const activePlans = (plans.data?.items ?? []).filter(
    (plan) => !["COMPLETED", "CANCELLED", "REFUSED"].includes(plan.status),
  );
  const latestPlanByEmployee = new Map<string, (typeof activePlans)[number]>();
  for (const plan of activePlans) {
    if (!latestPlanByEmployee.has(plan.employeeId)) latestPlanByEmployee.set(plan.employeeId, plan);
  }
  const people = [...latestPlanByEmployee.values()];
  const requestedPlanId = params.get("planId");
  const selectedPlan = people.find((plan) => plan.id === requestedPlanId) ?? people[0];
  const selectedPlanId = selectedPlan?.id ?? "";
  const q = useQuery({
    queryKey: ["tasks", selectedPlanId, params.get("status")],
    queryFn: () =>
      api.tasks.list({
        pageSize: 100,
        ...(selectedPlanId ? { planId: selectedPlanId } : {}),
        ...(params.get("status") ? { status: params.get("status")! } : {}),
      }),
    enabled: !!selectedPlanId,
    refetchInterval: selectedPlanId ? 5000 : false,
  });
  const search = (params.get("search") ?? "").toLowerCase();
  const items =
    q.data?.items.filter((t) => t.title.toLowerCase().includes(search)) ?? [];
  return (
    <>
      <Heading
        title="Work queue"
        description="Follow one employee’s onboarding tasks from approval through completion."
      />
      <section className="panel">
        <div className="toolbar">
          <label className="toolbar-select-label">
            <span>Employee</span>
            <select
              aria-label="Filter work by employee"
              value={selectedPlanId}
              disabled={plans.isPending || !people.length}
              onChange={(e) => setParams((current) => {
                current.set("planId", e.target.value);
                return current;
              })}
            >
              {people.map((plan) => <option value={plan.id} key={plan.id}>{plan.employeeName}</option>)}
            </select>
          </label>
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
        {plans.isError ? (
          <p className="notice danger">Unable to load active onboarding plans.</p>
        ) : plans.isPending ? (
          <div className="loading" role="status"><span className="spinner" />Loading active onboarding…</div>
        ) : !selectedPlanId ? (
          <Empty title="No active onboarding plans" text="Create an employee profile and generate a plan to see work here." />
        ) : (
          <>
            <div className="toolbar"><span className="muted">{items.length} tasks shown for {selectedPlan?.employeeName ?? "this employee"}’s current onboarding plan.</span></div>
            <QueryState query={q}><TaskRows tasks={items} /></QueryState>
          </>
        )}
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
    refetchInterval: (query) =>
      query.state.data?.status === "COMPLETED" || query.state.data?.status === "REFUSED"
        ? false
        : 5000,
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
  const reviewAll = useMutation({
    mutationFn: async () => {
      const pending = (p?.tasks ?? []).filter((t: any) => t.reviewState === "NEEDS_REVIEW");
      await Promise.all(
        pending.map((t: any) =>
          api.plans.updateTask(planId!, t.id, {
            reviewState: "OK",
            reason: "Batch reviewed by HR admin",
          }),
        ),
      );
    },
    onSuccess: () => void cache.invalidateQueries(),
  });
  return (
    <>
      <Heading
        title={p ? `${p.employeeName}’s onboarding` : "Onboarding plan"}
        description="Review the work, understand the dependencies and move forward with clarity."
      />
      <QueryState query={q}>
        {p && (
          <>
            {/* Enterprise Plan Hero Card */}
            <div className="plan-hero-card">
              <div className="plan-hero-top">
                <div className="plan-hero-badge-row">
                  <Badge value={p.status} />
                  <span className="plan-meta-pill">
                    <MapPin size={13} style={{ color: "var(--primary)" }} />
                    {p.jurisdictionCode === "IN-KA"
                      ? "Karnataka, India (IN-KA)"
                      : p.jurisdictionCode === "CA-ON"
                      ? "Ontario, Canada (CA-ON)"
                      : p.jurisdictionCode}
                  </span>
                  <span className="plan-meta-pill">
                    <Calendar size={13} style={{ color: "#64748b" }} />
                    First day: {date(p.startDate)}
                  </span>
                  <span className="plan-meta-pill">
                    <Sparkles size={13} />
                    {p.generationMode === "BASELINE_FALLBACK"
                      ? "Policy-template plan"
                      : p.generationMode === "LLM_GROUNDED"
                      ? "AI-assisted draft"
                      : human(p.generationMode)}
                  </span>
                </div>
              </div>

              <div className="plan-hero-progress-container">
                <div className="plan-progress-header">
                  <span className="plan-progress-title">Onboarding Journey Progress</span>
                  <span className="plan-progress-percent">
                    {p.taskCount ? Math.round((p.completedCount / p.taskCount) * 100) : 0}%
                  </span>
                </div>
                <div className="plan-progress-track">
                  <div
                    className="plan-progress-fill"
                    style={{
                      width: `${p.taskCount ? Math.round((p.completedCount / p.taskCount) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="plan-progress-sub">
                  {p.completedCount} of {p.taskCount} tasks completed
                </span>
              </div>
            </div>

            {p.refusalReason && (
              <p className="notice danger">{p.refusalReason}</p>
            )}
            {p.degradedReason && (
              <p className="notice warning" role="note">
                {p.degradedReason} Review the cited source material and plan before HR approval.
              </p>
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
                  {t === "Tasks" && <span className="tab-counter-badge">{p.taskCount}</span>}
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
                          <strong>{cleanDisplayName(n.title)}</strong>
                          <p>
                            {graph.data.edges
                              .filter((e) => e.to === n.id)
                              .map(
                                (e) =>
                                  cleanDisplayName(
                                    graph.data!.nodes.find((v) => v.id === e.from)?.title,
                                  ),
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
                    {p.tasks.some((t: any) => (t.authorityClass === "PAY_AFFECTING" || t.authorityClass === "LEGAL") && t.reviewState === "NEEDS_REVIEW") && (
                      <div
                        className="notice warning"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 14,
                          gap: 14,
                          padding: "12px 16px",
                          borderRadius: "10px",
                          background: "#fffbeb",
                          border: "1px solid #fde68a",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <ShieldCheck size={20} color="#d97706" />
                          <span style={{ fontSize: "13px", color: "#92400e" }}>
                            <strong>Compliance Check:</strong> Statutory payroll and identity tasks require HR review before dispatch.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button primary small"
                          disabled={reviewAll.isPending}
                          onClick={() => reviewAll.mutate()}
                          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                        >
                          {reviewAll.isPending ? "Reviewing…" : "⚡ Mark all as reviewed"}
                        </button>
                      </div>
                    )}
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
