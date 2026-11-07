import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Download,
  Upload,
  ArrowRight,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { api, request, can, getAccessToken } from "../lib/api";
import { useSession, workspaceFor } from "./session";
import {
  Heading,
  Panel,
  QueryState,
  Empty,
  Badge,
  Feedback,
  human,
  date,
  Metric,
} from "./ui";

type ServiceRow = {
  id: string;
  taskId: string;
  status?: string;
  kind?: string;
  notes?: string;
  completedAt?: string;
  dueDate?: string;
  windowClosesOn?: string;
  documentType?: string;
  rejectionReason?: string;
  document?: { id: string; fileName: string };
  course?: { title: string; description?: string; durationMinutes?: number };
  benefitPlan?: { name: string; description?: string };
  catalog?: { name: string };
  catalogItem?: { name: string };
  serialNumber?: string;
  buddyName?: string;
};
type Service = "documents" | "training" | "benefits" | "manager" | "equipment";
const configs: Record<
  Service,
  {
    title: string;
    description: string;
    load: () => Promise<{ items: ServiceRow[] }>;
  }
> = {
  documents: {
    title: "Documents",
    description:
      "Submit requested files and track verification. Only PDF, PNG and JPEG files up to 5 MB are accepted.",
    load: api.documents.requests,
  },
  training: {
    title: "Training",
    description: "Assigned learning, due dates and completion status.",
    load: api.training.assignments,
  },
  benefits: {
    title: "Benefits",
    description: "Review assigned benefit options and make your election.",
    load: api.benefits.enrollments,
  },
  manager: {
    title: "Manager tasks",
    description:
      "Coordinate introductions, buddy assignments and first-day conversations.",
    load: api.managerTasks.list,
  },
  equipment: {
    title: "Equipment",
    description: "Track equipment assignments and delivery status.",
    load: api.equipment.assignments,
  },
};
export function ServicePage({ service }: { service: Service }) {
  const { user } = useSession();
  const cfg = configs[service];
  const cache = useQueryClient();
  const q = useQuery({ queryKey: ["service", service], queryFn: cfg.load });
  const [search, setSearch] = useState("");
  const action = useMutation({
    mutationFn: async ({
      row,
      action,
      file,
    }: {
      row: ServiceRow;
      action: string;
      file?: File;
    }) => {
      if (action === "upload" && file) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Choose a file no larger than 5 MB.");
        const buffer = await file.arrayBuffer();
        let binary = "";
        for (const byte of new Uint8Array(buffer))
          binary += String.fromCharCode(byte);
        return request(`/document-requests/${row.id}/upload`, {
          method: "POST",
          body: {
            fileName: file.name,
            mimeType: file.type,
            contentBase64: btoa(binary),
          },
        });
      }
      if (action === "download") {
        const response = await fetch(
          `/api/v1/documents/${row.document!.id}/content`,
          {
            headers: { Authorization: `Bearer ${getAccessToken()}` },
            credentials: "include",
          },
        );
        if (!response.ok)
          throw new Error("Document download failed. Please try again.");
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = row.document!.fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      if (action === "verify")
        return api.documents.verify(row.id, { decision: "VERIFY" });
      if (action === "training") return api.training.complete(row.id, {});
      if (action === "manager")
        return api.managerTasks.upsert(row.taskId, {
          markComplete: true,
          notes: "Completed from manager workspace",
        });
      if (action === "ELECT" || action === "WAIVE")
        return api.benefits.elect(row.id, {
          decision: action,
          dependentsCount: 0,
        });
      if (
        action === "DELIVERED" ||
        action === "ORDERED" ||
        action === "SHIPPED"
      )
        return api.equipment.update(row.id, { status: action });
      throw new Error("Unsupported operation");
    },
    onSuccess: () => void cache.invalidateQueries(),
  });
  const rows =
    q.data?.items.filter((r) =>
      JSON.stringify([
        r.documentType,
        r.course?.title,
        r.benefitPlan?.name,
        r.kind,
        r.catalogItem?.name,
      ])
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <>
      <Heading title={cfg.title} description={cfg.description} />
      <Feedback
        error={action.error}
        success={
          action.isSuccess ? "Action completed successfully." : undefined
        }
      />
      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label={`Search ${service}`}
              placeholder="Filter loaded records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span className="muted">{rows.length} loaded records</span>
        </div>
        <QueryState query={q}>
          {rows.length ? (
            <div className="service-list">
              {rows.map((row) => (
                <article key={row.id}>
                  <span className="service-glyph">
                    {service === "documents" ? (
                      <Upload size={20} />
                    ) : (
                      <BookOpen size={20} />
                    )}
                  </span>
                  <div className="service-content">
                    <h3>
                      {row.course?.title ??
                        row.benefitPlan?.name ??
                        row.catalogItem?.name ??
                        row.catalog?.name ??
                        human(row.documentType ?? row.kind)}
                    </h3>
                    <p>
                      {row.course?.description ??
                        row.benefitPlan?.description ??
                        row.notes ??
                        (row.document?.fileName ||
                          "Assigned through an approved onboarding plan.")}
                    </p>
                    <small>
                      {row.dueDate
                        ? `Due ${date(row.dueDate)}`
                        : row.windowClosesOn
                          ? `Election closes ${date(row.windowClosesOn)}`
                          : row.buddyName
                            ? `Buddy: ${row.buddyName}`
                            : ""}
                    </small>
                    {row.rejectionReason && (
                      <p className="notice warning">{row.rejectionReason}</p>
                    )}
                  </div>
                  <div className="service-actions">
                    <Badge
                      value={
                        row.status ??
                        (row.completedAt ? "COMPLETED" : "NOT_STARTED")
                      }
                    />
                    {service === "documents" && (
                      <>
                        {row.document && (
                          <button
                            className="button secondary small"
                            disabled={action.isPending}
                            onClick={() =>
                              action.mutate({ row, action: "download" })
                            }
                          >
                            <Download size={14} />
                            {action.isPending && action.variables?.row.id === row.id && action.variables.action === "download" ? "Downloading…" : "Download"}
                          </button>
                        )}
                        {can(user, "document.upload") &&
                          ["REQUESTED", "REJECTED"].includes(
                            row.status ?? "",
                          ) && (
                            <label className="button secondary small upload-label">
                              <Upload size={14} />
                              {action.isPending && action.variables?.row.id === row.id && action.variables.action === "upload" ? "Uploading…" : "Choose file"}
                              <input
                                type="file"
                                aria-label={`Upload ${row.documentType}`}
                                accept="application/pdf,image/png,image/jpeg"
                                disabled={action.isPending}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file)
                                    action.mutate({
                                      row,
                                      action: "upload",
                                      file,
                                    });
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        {can(user, "document.verify") &&
                          row.status === "UPLOADED" && (
                            <button
                              className="button primary small"
                              disabled={action.isPending}
                              onClick={() =>
                                action.mutate({ row, action: "verify" })
                              }
                            >
                              {action.isPending && action.variables?.row.id === row.id && action.variables.action === "verify" ? "Verifying…" : "Verify"}
                            </button>
                          )}
                      </>
                    )}
                    {service === "training" &&
                      can(user, "training.complete") &&
                      row.status !== "COMPLETED" && (
                        <button
                          className="button secondary small"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({ row, action: "training" })
                          }
                        >
                          {action.isPending && action.variables?.row.id === row.id ? "Saving…" : "Confirm completed"}
                        </button>
                      )}
                    {service === "manager" &&
                      can(user, "managertask.write") &&
                      !row.completedAt && (
                        <button
                          className="button secondary small"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({ row, action: "manager" })
                          }
                        >
                          {action.isPending && action.variables?.row.id === row.id ? "Saving…" : "Mark completed"}
                        </button>
                      )}
                    {service === "benefits" &&
                      can(user, "benefit.enrol") &&
                      ["WINDOW_OPEN"].includes(row.status ?? "") && (
                        <>
                          {["ELECT", "WAIVE"].map((a) => (
                            <button
                              key={a}
                              className="button secondary small"
                              disabled={action.isPending}
                              onClick={() => action.mutate({ row, action: a })}
                            >
                              {action.isPending && action.variables?.row.id === row.id && action.variables.action === a ? "Saving…" : human(a)}
                            </button>
                          ))}
                        </>
                      )}
                    {service === "equipment" &&
                      can(user, "equipment.assign") &&
                      ["REQUESTED", "ORDERED", "SHIPPED"].includes(
                        row.status ?? "",
                      ) && (
                        <button
                          className="button secondary small"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate({
                              row,
                              action:
                                row.status === "REQUESTED"
                                  ? "ORDERED"
                                  : row.status === "ORDERED"
                                    ? "SHIPPED"
                                    : "DELIVERED",
                            })
                          }
                        >
                          {action.isPending && action.variables?.row.id === row.id ? "Updating…" : row.status === "REQUESTED"
                            ? "Mark ordered"
                            : row.status === "ORDERED"
                              ? "Mark shipped"
                              : "Confirm delivery"}
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title={`No ${service === "manager" ? "manager tasks" : service} to show`}
              text="Assignments appear after HR approves and dispatches an onboarding plan."
            />
          )}
        </QueryState>
      </section>
    </>
  );
}
export function Departments() {
  const q = useQuery({
    queryKey: ["departments"],
    queryFn: api.reference.departments,
  });
  return (
    <>
      <Heading
        title="The teams behind every welcome."
        description="Organization departments used for employee profiles and workflow ownership."
      />
      <QueryState query={q}>
        <div className="department-grid">
          {q.data?.map((d, i) => (
            <article className="department-card" key={d.id}>
              <span className="action-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2>{d.name}</h2>
              <p>{d.code}</p>
              <Link
                to={`/hr/employees?departmentId=${encodeURIComponent(d.id)}`}
              >
                View people directory <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
        {!q.data?.length && <Empty title="No departments configured" />}
      </QueryState>
    </>
  );
}
export function Policies({ assistant = false }: { assistant?: boolean }) {
  const { user } = useSession();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [docTitle, setDocTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("IN-KA");
  const [category, setCategory] = useState("onboarding");
  const [sourceUri, setSourceUri] = useState("");
  const [version, setVersion] = useState("1.0");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [clauseId, setClauseId] = useState("");
  const [clauseHeading, setClauseHeading] = useState("");
  const [clauseBody, setClauseBody] = useState("");
  const [topics, setTopics] = useState("");
  const [confirmedSource, setConfirmedSource] = useState(false);
  const createPolicy = useMutation({
    mutationFn: () => api.policies.create({
      jurisdictionCode: jurisdiction || null,
      title: docTitle,
      category,
      sourceUri,
      version,
      effectiveFrom,
      clauses: [{
        id: clauseId,
        jurisdictionCode: jurisdiction || null,
        heading: clauseHeading || null,
        body: clauseBody,
        topics: topics.split(",").map((topic) => topic.trim()).filter(Boolean),
      }],
      confirmApprovedSource: true,
    }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["policies"] });
      setDocTitle(""); setSourceUri(""); setClauseId(""); setClauseHeading("");
      setClauseBody(""); setTopics(""); setConfirmedSource(false);
    },
  });
  const q = useQuery({
    queryKey: ["policies", params.toString()],
    queryFn: () =>
      api.policies.list({ pageSize: 100, search: params.get("search") ?? "" }),
  });
  return (
    <>
      <Heading
        title={
          assistant
            ? "Find clarity in your policies."
            : "Knowledge behind the journey."
        }
        description={
          assistant
            ? "Search policy documents. This source browser does not generate AI answers."
            : "Explore policy coverage and the documents used to inform onboarding plans."
        }
      />
      <div className="notice">
        <ShieldCheck size={18} />
        Policy grounded tasks require HR approved source documents. Until those are added, orchestration generates only a limited internal setup checklist and does not invent local legal, payroll, or benefits requirements.
      </div>
      {!assistant && can(user, "policy.write") && (
        <Panel title="Add an approved policy source" description="Enter a real organization or official source and one clause. This source will be available to the onboarding plan agents.">
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); if (confirmedSource) createPolicy.mutate(); }}>
            <label>Document title<input required minLength={3} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} /></label>
            <label>Jurisdiction code<input required value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value.toUpperCase())} placeholder="IN-KA or US-CA" /></label>
            <label>Category<input required value={category} onChange={(e) => setCategory(e.target.value)} /></label>
            <label>Official source URL<input required type="url" value={sourceUri} onChange={(e) => setSourceUri(e.target.value)} /></label>
            <label>Version<input required value={version} onChange={(e) => setVersion(e.target.value)} /></label>
            <label>Effective from<input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></label>
            <label>Clause ID<input required value={clauseId} onChange={(e) => setClauseId(e.target.value)} placeholder="ORG-HR-001" /></label>
            <label>Clause heading<input value={clauseHeading} onChange={(e) => setClauseHeading(e.target.value)} /></label>
            <label className="form-grid-full">Clause text<textarea required minLength={30} rows={5} value={clauseBody} onChange={(e) => setClauseBody(e.target.value)} /></label>
            <label>Topics, comma separated<input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="equipment, first day" /></label>
            <label className="form-grid-full checkbox-label"><input type="checkbox" checked={confirmedSource} onChange={(e) => setConfirmedSource(e.target.checked)} /> I confirm this is an approved, current source for our organization or jurisdiction.</label>
            <div className="form-grid-full"><Feedback error={createPolicy.error} success={createPolicy.isSuccess ? "Approved source added." : undefined} /><button className="primary-button" disabled={!confirmedSource || createPolicy.isPending}>{createPolicy.isPending ? "Saving source…" : "Add policy source"}</button></div>
          </form>
        </Panel>
      )}
      <section className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search policies"
              placeholder="Search policies or a topic"
              value={params.get("search") ?? ""}
              onChange={(e) =>
                setParams({ search: e.target.value }, { replace: true })
              }
            />
          </label>
        </div>
        <QueryState query={q}>
          {q.data?.items.length ? (
            <div className="policy-grid">
              {q.data.items.map((p) => (
                <article key={p.id}>
                  <span className="eyebrow">
                    {p.jurisdictionCode} · {human(p.category)}
                  </span>
                  <h2>{p.title}</h2>
                  <p>
                    Version {p.version} · Effective {date(p.effectiveFrom)}
                  </p>
                  <div className="policy-meta">
                    <Badge value={p.isMock ? "DEMO_POLICY" : "POLICY"} />
                    <span>{p.clauseCount ?? 0} clauses</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No matching policies"
              text="Try a different topic or ask HR about coverage for your location."
            />
          )}
        </QueryState>
      </section>
    </>
  );
}
export function Analytics() {
  const q = useQuery({
    queryKey: ["plans", "analytics"],
    queryFn: () => api.plans.list({ pageSize: 100 }),
  });
  const rows = q.data?.items ?? [];
  return (
    <>
      <Heading
        title="Progress you can account for."
        description="Calculated from up to 100 accessible plans. No estimated trends or synthetic scores."
      />
      <QueryState query={q}>
        <div className="metrics">
          <Metric
            label="Plans loaded"
            value={rows.length}
            detail={`${q.data?.meta.totalItems ?? 0} total accessible plans`}
          />
          <Metric
            label="Completed plans"
            value={rows.filter((p) => p.status === "COMPLETED").length}
            detail="Recorded completed state"
          />
          <Metric
            label="At-risk tasks"
            value={rows.reduce((n, p) => n + p.atRiskCount, 0)}
            detail="Flagged by plan risk checks"
          />
        </div>
        <Panel
          title="Plan status distribution"
          description="Counts in the loaded records"
        >
          <div className="chart-bars">
            {[
              "DRAFT",
              "AWAITING_APPROVAL",
              "APPROVED",
              "IN_PROGRESS",
              "COMPLETED",
              "REFUSED",
            ].map((s) => {
              const n = rows.filter((p) => p.status === s).length;
              return (
                <div key={s}>
                  <span>{human(s)}</span>
                  <div>
                    <i
                      style={{
                        width: `${rows.length ? (n / rows.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <strong>{n}</strong>
                </div>
              );
            })}
          </div>
        </Panel>
      </QueryState>
    </>
  );
}
export function Audit() {
  const [params, setParams] = useSearchParams();
  const plans = useQuery({
    queryKey: ["plans", "audit-selector"],
    queryFn: () => api.plans.list({ pageSize: 100 }),
  });
  const id = params.get("plan") ?? "";
  const q = useQuery({
    queryKey: ["audit", id],
    queryFn: () => api.plans.audit(id),
    enabled: !!id,
  });
  return (
    <>
      <Heading
        title="A record of every decision."
        description="Inspect audit events returned for a selected onboarding plan."
      />
      <Panel title="Plan history">
        <div className="toolbar">
          <select
            aria-label="Select plan for audit history"
            value={id}
            onChange={(e) => setParams({ plan: e.target.value })}
          >
            <option value="">Select an onboarding plan</option>
            {plans.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.employeeName} · {human(p.status)}
              </option>
            ))}
          </select>
        </div>
        {plans.isError && (
          <p className="notice danger">Unable to load plans.</p>
        )}
        {id ? (
          <QueryState query={q}>
            {q.data?.items.length ? (
              <div className="timeline">
                {q.data.items.map((e) => (
                  <article key={e.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{human(e.action)}</strong>
                      <p>{e.reason ?? e.resourceType}</p>
                      <small>
                        {e.actorName ?? "System"} · {date(e.createdAt)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="No events returned" />
            )}
          </QueryState>
        ) : (
          <Empty
            title="Choose a plan"
            text="Select a plan above to inspect its recorded history."
          />
        )}
      </Panel>
    </>
  );
}
export function Settings() {
  const { user } = useSession();
  const change = useMutation({
    mutationFn: (body: Record<string, string>) =>
      request<{ message: string }>("/auth/change-password", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      window.dispatchEvent(new Event("session-expired"));
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    change.mutate(f);
  }
  return (
    <>
      <Heading
        title="Account settings"
        description="Review your CLYORA account permissions and manage sign-in security."
      />
      <div className="detail-grid">
        <Panel title="Account information">
          <dl className="detail-list">
            <div>
              <dt>Email address</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Assigned roles</dt>
              <dd>{user?.roles.map(human).join(", ")}</dd>
            </div>
            <div>
              <dt>Account status</dt>
              <dd>
                <Badge value={user?.status ?? "UNKNOWN"} />
              </dd>
            </div>
          </dl>
          <details className="panel-body">
            <summary>View effective permissions</summary>
            <ul className="permission-list">
              {user?.permissions.map((p) => (
                <li key={p.key}>
                  <code>{p.key}</code>
                  <Badge value={p.scope} />
                </li>
              ))}
            </ul>
          </details>
        </Panel>
        <Panel
          title="Change password"
          description="Changing your password revokes your existing sessions."
        >
          <form className="panel-body form-vertical" onSubmit={submit}>
            <label>
              Current password
              <input
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
            <Feedback error={change.error} success={change.data?.message} />
            {change.isSuccess ? (
              <Link className="button primary" to="/login">
                Sign in again
              </Link>
            ) : (
            <button className="button primary" disabled={change.isPending}>
              {change.isPending ? "Updating password…" : "Update password"}
              </button>
            )}
          </form>
        </Panel>
      </div>
    </>
  );
}
export function Help() {
  const { user } = useSession();
  const w = workspaceFor(user!);
  return (
    <>
      <Heading
        title="Help & guidance"
        description="Understand your CLYORA workspace and the path from a new profile to a completed journey."
      />
      <div className="help-grid">
        {[
          [
            "01",
            "Start with the person",
            "HR creates a profile with the employee’s role, location and joining date.",
          ],
          [
            "02",
            "Prepare a grounded plan",
            "Policies and task templates guide the plan. AI proposals are validated; fallback plans are labelled.",
          ],
          [
            "03",
            "Review before action",
            "Authorized HR reviewers inspect tasks, sources and findings before approving dispatch.",
          ],
          [
            "04",
            "Complete and verify",
            "Teams complete their service tasks. Documents and payroll require their verification steps.",
          ],
        ].map(([n, t, d]) => (
          <Panel key={n} title={`${n} / ${t}`}>
            <p className="panel-body">{d}</p>
          </Panel>
        ))}
      </div>
      <Panel title="Need help with access?">
        <div className="panel-body">
          <p>
            Contact your HR administrator for account recovery, employee profile
            corrections or permission changes.
          </p>
          <Link className="text-link" to={`/${w}/settings`}>
            Review your account <ArrowRight size={16} />
          </Link>
        </div>
      </Panel>
    </>
  );
}

export function Payroll() {
  const [params, setParams] = useSearchParams();
  const id = params.get("task") ?? "";
  const tasks = useQuery({
    queryKey: ["payroll-tasks"],
    queryFn: () => api.tasks.list({ service: "PAYROLL", pageSize: 100 }),
  });
  const setup = useQuery({
    queryKey: ["payroll", id],
    queryFn: () => api.payroll.get(id),
    enabled: !!id,
  });
  const cache = useQueryClient();
  const [ack, setAck] = useState(false);
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.payroll.upsert>[1]) =>
      api.payroll.upsert(id, body),
    onSuccess: () => void cache.invalidateQueries(),
  });
  const verify = useMutation({
    mutationFn: () => api.payroll.verify(id, { acknowledgement: true }),
    onSuccess: () => {
      setAck(false);
      void cache.invalidateQueries();
    },
  });
  return (
    <>
      <Heading
        title="Payroll setup"
        description="Configure the required details, then explicitly verify before completing the task. Sensitive fields are limited to authorized roles."
      />
      <Panel title="Payroll task">
        <div className="toolbar">
          <select
            aria-label="Choose payroll task"
            value={id}
            onChange={(e) => setParams({ task: e.target.value })}
          >
            <option value="">Select a payroll task</option>
            {tasks.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · {t.dueDate} · {t.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        {tasks.isError && (
          <p className="notice danger">Unable to load payroll tasks.</p>
        )}
        {id ? (
          <QueryState query={setup}>
            <div className="panel-body">
              <Badge value={setup.data?.status ?? "PENDING"} />
              <form
                key={id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const bank = String(f.get("bankAccountNumber") ?? "");
                  save.mutate({
                    payFrequency: String(f.get("payFrequency")) as "MONTHLY",
                    salaryCurrency: String(f.get("salaryCurrency")),
                    taxFormType: String(f.get("taxFormType")),
                    taxFormReceived: f.get("taxFormReceived") === "on",
                    ...(bank ? { bankAccountNumber: bank } : {}),
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Pay frequency
                    <select
                      name="payFrequency"
                      defaultValue={setup.data?.payFrequency ?? "MONTHLY"}
                    >
                      {["WEEKLY", "BIWEEKLY", "SEMIMONTHLY", "MONTHLY"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Currency
                    <input
                      name="salaryCurrency"
                      required
                      minLength={3}
                      maxLength={3}
                      defaultValue={setup.data?.salaryCurrency ?? ""}
                      placeholder="CAD"
                    />
                  </label>
                  <label>
                    Tax form type
                    <input
                      name="taxFormType"
                      required
                      defaultValue={setup.data?.taxFormType ?? ""}
                    />
                  </label>
                  <label>
                    Bank account number
                    <input
                      name="bankAccountNumber"
                      type="password"
                      autoComplete="off"
                      pattern="[0-9]{6,20}"
                      placeholder={
                        setup.data?.bankAccountLast4
                          ? `On file, ending ${setup.data.bankAccountLast4}`
                          : "6–20 digits"
                      }
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      name="taxFormReceived"
                      type="checkbox"
                      defaultChecked={!!setup.data?.taxFormReceivedAt}
                    />
                    Tax form received and checked
                  </label>
                </div>
                <Feedback
                  error={save.error}
                  success={
                    save.isSuccess ? "Payroll details saved." : undefined
                  }
                />
                <button className="button secondary" disabled={save.isPending}>
                  {save.isPending ? "Saving payroll details…" : "Save payroll details"}
                </button>
              </form>
              <hr />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I have verified the payroll information and accept
                responsibility for this action.
              </label>
              <Feedback
                error={verify.error}
                success={verify.isSuccess ? "Payroll verified." : undefined}
              />
              <button
                className="button primary"
                disabled={
                  !ack || verify.isPending || setup.data?.status === "VERIFIED"
                }
                onClick={() => verify.mutate()}
              >
                {verify.isPending ? "Verifying payroll…" : "Verify payroll"}
              </button>
            </div>
          </QueryState>
        ) : (
          <Empty title="Select a task to begin" />
        )}
      </Panel>
    </>
  );
}
