import { useState } from "react";
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
import { api, request, can, getAccessToken, ApiError } from "../lib/api";
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
  displayTaskTitle,
  cleanDisplayName,
  cleanDisplayDescription,
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
  buddyEmployeeId?: string | null;
  agenda?: { time: string; title: string; owner?: string }[] | null;
  employeeId?: string;
  employeeName?: string;
  planId?: string;
  taskTitle?: string;
  taskDescription?: string | null;
  taskStatus?: string;
  blockedBy?: string[];
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
  const q = useQuery({
    queryKey: ["service", service],
    queryFn: cfg.load,
    refetchInterval: service === "manager" ? 5000 : false,
  });
  const [search, setSearch] = useState("");
  const [managerError, setManagerError] = useState("");
  const [managerDrafts, setManagerDrafts] = useState<Record<string, { buddyEmployeeId: string; agendaText: string; notes: string }>>({});
  const team = useQuery({
    queryKey: ["manager-buddy-options"],
    queryFn: () => api.employees.list({ pageSize: 100, sort: "lastName" }),
    enabled: service === "manager" && can(user, "employee.read"),
  });
  const action = useMutation({
    mutationFn: async ({
      row,
      action,
      file,
      managerInput,
    }: {
      row: ServiceRow;
      action: string;
      file?: File;
      managerInput?: { buddyEmployeeId?: string; agenda?: { time: string; title: string }[]; notes?: string; markComplete: boolean };
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
      if (action === "manager") return api.managerTasks.upsert(row.taskId, managerInput ?? { markComplete: false });
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
      if (action === "RECEIVED") return api.equipment.receipt(row.id);
      throw new Error("Unsupported operation");
    },
    onSuccess: () => void cache.invalidateQueries(),
  });
  const managerDraft = (row: ServiceRow) => managerDrafts[row.taskId] ?? {
    buddyEmployeeId: row.buddyEmployeeId ?? "",
    agendaText: (row.agenda ?? []).map((a) => `${a.time} | ${a.title}`).join("\n"),
    notes: row.notes ?? "",
  };
  const submitManagerTask = (row: ServiceRow, markComplete: boolean) => {
    const draft = managerDraft(row);
    const needsAgenda = ["PREPARE_DAY_ONE_AGENDA", "SCHEDULE_INTRO_MEETINGS", "DAY_ONE_AGENDA", "INTRO_MEETINGS"].includes(row.kind ?? "");
    const agenda: { time: string; title: string }[] = [];
    if (needsAgenda) {
      for (const line of draft.agendaText.split("\n").map((value) => value.trim()).filter(Boolean)) {
        const match = line.match(/^(\d{2}:\d{2})\s*\|\s*(.+)$/);
        if (!match) {
          setManagerError("Enter each agenda item as HH:MM | Description.");
          return;
        }
        agenda.push({ time: match[1]!, title: match[2]! });
      }
    }
    setManagerError("");
    if (markComplete && row.kind === "BUDDY_ASSIGNMENT" && !draft.buddyEmployeeId) {
      setManagerError("Choose a teammate or select yourself as the onboarding contact before completing this task.");
      return;
    }
    if (markComplete && needsAgenda && !agenda.length) {
      setManagerError("Add at least one agenda item before completing this task.");
      return;
    }
    if (markComplete && ["ACCESS_APPROVAL", "PROBATION_GOALS"].includes(row.kind ?? "") && !draft.notes.trim()) {
      setManagerError("Add completion notes before completing this task.");
      return;
    }
    action.mutate({
      row,
      action: "manager",
      managerInput: {
        markComplete,
        ...(row.kind === "BUDDY_ASSIGNMENT" && draft.buddyEmployeeId ? { buddyEmployeeId: draft.buddyEmployeeId } : {}),
        ...(needsAgenda ? { agenda } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      },
    });
  };
  const rows =
    q.data?.items.filter((r) =>
      JSON.stringify([
        r.documentType,
        r.course?.title,
        r.benefitPlan?.name,
        r.kind,
        r.taskTitle,
        r.employeeName,
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
          action.isSuccess
            ? service === "manager"
              ? action.variables?.managerInput?.markComplete
                ? "Manager task completed. The plan and prerequisites have been updated."
                : "Manager task details saved."
              : "Action completed successfully."
            : undefined
        }
      />
      {managerError && service === "manager" && <p className="notice warning" role="alert">{managerError}</p>}
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
                      {cleanDisplayName(row.taskTitle ?? row.course?.title ??
                        row.benefitPlan?.name ??
                        row.catalogItem?.name ??
                        row.catalog?.name ??
                        human(row.documentType ?? row.kind))}
                    </h3>
                    <p>
                      {row.employeeName ? `For ${row.employeeName}. ` : ""}{cleanDisplayDescription(row.taskDescription ?? row.course?.description ??
                        row.benefitPlan?.description ??
                        row.notes ??
                        (row.document?.fileName ||
                          "Assigned through an approved onboarding plan."))}
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
                    {service === "manager" && row.planId && (
                      <Link to={`/manager/onboarding/${row.planId}`}>View full onboarding plan</Link>
                    )}
                    {service === "manager" && (
                      <>
                        {row.kind === "BUDDY_ASSIGNMENT" && (
                          <label className="form-field" style={{ marginTop: 12 }}>
                            <span className="field-label">Onboarding buddy or contact</span>
                            <select aria-label={`Onboarding buddy for ${row.employeeName ?? "employee"}`} value={managerDraft(row).buddyEmployeeId} disabled={!!row.completedAt || action.isPending || team.isLoading || team.isError} onChange={(e) => setManagerDrafts((d) => ({ ...d, [row.taskId]: { ...managerDraft(row), buddyEmployeeId: e.target.value } }))}>
                              {team.isLoading && <option value="">Loading team…</option>}
                              <option value="">Choose a team member</option>
                              {(team.data?.items ?? []).filter((person) => person.id !== row.employeeId && person.status === "ACTIVE").map((person) => <option value={person.id} key={person.id}>{person.firstName} {person.lastName}{person.id === user?.employeeId ? " (you)" : ""}</option>)}
                            </select>
                            <small className="field-hint">Choose a teammate, or serve as the onboarding contact yourself when the team is small.</small>
                            {team.isError && <small className="field-hint">Could not load team members. Refresh this page and try again.</small>}
                            {team.isSuccess && !team.data.items.some((person) => person.id !== row.employeeId && person.status === "ACTIVE") && <small className="field-hint">No active teammates are available. Ask HR to add a teammate or contact HR for help.</small>}
                          </label>
                        )}
                        {["DAY_ONE_AGENDA", "INTRO_MEETINGS"].includes(row.kind ?? "") && (
                          <label className="form-field" style={{ marginTop: 12 }}>
                            <span className="field-label">Agenda items</span>
                            <textarea rows={3} placeholder={"09:00 | Welcome and introductions\n10:00 | Team setup"} value={managerDraft(row).agendaText} disabled={!!row.completedAt || action.isPending} onChange={(e) => setManagerDrafts((d) => ({ ...d, [row.taskId]: { ...managerDraft(row), agendaText: e.target.value } }))} />
                            <small className="field-hint">One item per line, formatted as HH:MM | Description.</small>
                          </label>
                        )}
                        {["ACCESS_APPROVAL", "PROBATION_GOALS"].includes(row.kind ?? "") && (
                          <label className="form-field" style={{ marginTop: 12 }}>
                            <span className="field-label">Completion notes</span>
                            <textarea rows={3} value={managerDraft(row).notes} disabled={!!row.completedAt || action.isPending} onChange={(e) => setManagerDrafts((d) => ({ ...d, [row.taskId]: { ...managerDraft(row), notes: e.target.value } }))} placeholder="Record the access review or agreed goals." />
                          </label>
                        )}
                        {!!row.blockedBy?.length && <p className="notice warning">Waiting for: {row.blockedBy.join(", ")}</p>}
                      </>
                    )}
                    {row.rejectionReason && (
                      <p className="notice warning">{row.rejectionReason}</p>
                    )}
                  </div>
                  <div className="service-actions">
                    <Badge
                      value={
                        row.taskStatus ?? row.status ??
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
                    {service === "equipment" &&
                        can(user, "equipment.receipt") &&
                        row.status === "DELIVERED" && (
                          <button
                            className="button primary small"
                            disabled={action.isPending}
                            onClick={() =>
                              action.mutate({ row, action: "RECEIVED" })
                            }
                          >
                            {action.isPending &&
                            action.variables?.row.id === row.id
                              ? "Acknowledging…"
                              : "Acknowledge receipt"}
                          </button>
                        )}
                    {service === "manager" &&
                      can(user, "managertask.write") &&
                      !row.completedAt && row.taskStatus !== "COMPLETED" && row.taskStatus !== "SKIPPED" && (
                        <div className="form-vertical" style={{ gap: 8 }}>
                          <button className="button secondary small" disabled={action.isPending || !!row.blockedBy?.length} onClick={() => submitManagerTask(row, false)}>
                            {action.isPending && action.variables?.row.id === row.id ? "Saving…" : "Save details"}
                          </button>
                          <button className="button primary small" disabled={action.isPending || !!row.blockedBy?.length} onClick={() => submitManagerTask(row, true)}>
                            {action.isPending && action.variables?.row.id === row.id ? "Completing…" : "Save & complete"}
                          </button>
                        </div>
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
              text={
                service === "manager"
                  ? "No approved onboarding plan is assigned to you yet. HR must create the employee profile with you as manager, generate the plan, and approve it. Then your buddy/contact, Day 1 agenda, introductions, and 30-60-90 goal tasks will appear here automatically."
                  : "Assignments appear after HR approves and dispatches an onboarding plan."
              }
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
                  <h2>{cleanDisplayName(p.title)}</h2>
                  <p>
                    Version {p.version} · Effective {date(p.effectiveFrom)}
                  </p>
                  <div className="policy-meta">
                    <Badge value="POLICY" />
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
          <details className="panel-body permission-disclosure">
            <summary>View effective permissions</summary>
            <ul className="permission-list">
              {user?.permissions.map((p) => (
                <li key={p.key}>
                  <span>{human(p.key)}</span>
                  <Badge value={p.scope} />
                </li>
              ))}
            </ul>
          </details>
        </Panel>
        <Panel title="Sign-in security" description="Your organization manages passwords, multi-factor authentication and account recovery through secure sign-in.">
          <div className="panel-body auth-settings-card"><ShieldCheck size={24}/><p>Use your organization sign-in provider to update your password or security settings. CLYORA never stores or changes your provider password.</p><a className="button secondary" href="/api/v1/auth/oidc/start">Open organization sign-in</a></div>
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

const CURRENCY_OPTIONS = [
  { code: "INR", label: "INR (₹) - Indian Rupee" },
  { code: "USD", label: "USD ($) - US Dollar" },
  { code: "CAD", label: "CAD (C$) - Canadian Dollar" },
  { code: "EUR", label: "EUR (€) - Euro" },
  { code: "GBP", label: "GBP (£) - British Pound" },
  { code: "AUD", label: "AUD (A$) - Australian Dollar" },
  { code: "SGD", label: "SGD (S$) - Singapore Dollar" },
  { code: "AED", label: "AED (د.إ) - UAE Dirham" },
  { code: "JPY", label: "JPY (¥) - Japanese Yen" },
  { code: "CHF", label: "CHF (Fr) - Swiss Franc" },
  { code: "NZD", label: "NZD (NZ$) - New Zealand Dollar" },
  { code: "HKD", label: "HKD (HK$) - Hong Kong Dollar" },
  { code: "ZAR", label: "ZAR (R) - South African Rand" },
] as const;

export function Payroll() {
  const { user } = useSession();
  const canVerify = can(user, "payroll.verify");
  const [params, setParams] = useSearchParams();
  const id = params.get("task") ?? "";
  const tasks = useQuery({
    queryKey: ["payroll-tasks"],
    queryFn: () => api.tasks.list({ service: "PAYROLL", pageSize: 100 }),
  });
  const setup = useQuery({
    queryKey: ["payroll", id],
    queryFn: async () => {
      try { return await api.payroll.get(id); }
      catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
    },
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
  const payrollStatus = setup.data?.status ?? "PENDING";
  const taxComplete = Boolean(setup.data?.taxFormReceivedAt);
  const bankComplete = Boolean(setup.data?.bankAccountLast4);
  const payrollVerified = payrollStatus === "VERIFIED";
  return (
    <>
      <Heading
        title="Payroll setup"
        description="Configure the required details, then explicitly verify before completing the task. Sensitive fields are limited to authorized roles."
      />
      <Panel title="Payroll task">
        <p className="panel-body payroll-intro">Complete the employee’s tax and bank setup. Payroll becomes ready for review only after both steps are recorded.</p>
        <div className="toolbar">
          <select
            aria-label="Choose payroll task"
            value={id}
            onChange={(e) => setParams({ task: e.target.value })}
          >
            <option value="">Select a payroll task</option>
            {tasks.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {(t as typeof t & { employeeName?: string | null }).employeeName ? `${(t as typeof t & { employeeName?: string | null }).employeeName} · ` : ""}{displayTaskTitle(t.title)} · {t.dueDate} ·{" "}
                {t.id.slice(0, 8)}
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
              {!setup.data && <p className="notice info">Payroll setup has not been started. Enter the required details and save to create it.</p>}
              <div className="payroll-status-row"><Badge value={payrollStatus} />{setup.data?.bankAccountLast4 && <span className="muted">Bank account ending in {setup.data.bankAccountLast4}</span>}</div>
              <ol className="payroll-progress" aria-label="Payroll setup progress">
                <li className={taxComplete ? "complete" : "current"}><span>1</span><div><strong>Tax form</strong><small>{taxComplete ? "Received" : "Required"}</small></div></li>
                <li className={bankComplete ? "complete" : taxComplete ? "current" : ""}><span>2</span><div><strong>Bank details</strong><small>{bankComplete ? "Saved securely" : "Required"}</small></div></li>
                <li className={payrollVerified ? "complete" : bankComplete && taxComplete ? "current" : ""}><span>3</span><div><strong>Review</strong><small>{payrollVerified ? "Verified" : "HR approval"}</small></div></li>
              </ol>
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
                      disabled={payrollVerified}
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
                    <select
                      name="salaryCurrency"
                      disabled={payrollVerified}
                      required
                      defaultValue={setup.data?.salaryCurrency || "INR"}
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                      {setup.data?.salaryCurrency &&
                        !CURRENCY_OPTIONS.some((c) => c.code === setup.data?.salaryCurrency) && (
                          <option value={setup.data.salaryCurrency}>
                            {setup.data.salaryCurrency}
                          </option>
                        )}
                    </select>
                  </label>
                  <label>
                    Tax form type
                    <input
                      name="taxFormType"
                      disabled={payrollVerified}
                      required
                      defaultValue={setup.data?.taxFormType ?? ""}
                    />
                  </label>
                  <label>
                    Bank account number
                    <input
                      name="bankAccountNumber"
                      type="password"
                      disabled={payrollVerified}
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
                      disabled={payrollVerified}
                      defaultChecked={!!setup.data?.taxFormReceivedAt}
                    />
                    Tax form received and checked
                  </label>
                </div>
                <p className="field-hint">The full bank number is never stored; only its last four digits are retained for verification.</p>
                <Feedback
                  error={save.error}
                  success={
                    save.isSuccess ? "Payroll details saved." : undefined
                  }
                />
                <button className="button secondary" disabled={save.isPending || payrollVerified}>
                  {save.isPending ? "Saving payroll details…" : payrollVerified ? "Payroll details locked after verification" : "Save payroll details"}
                </button>
              </form>
              {canVerify ? (
                <>
                  <hr />
                  <label className="checkbox-label">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                    I reviewed the tax and bank details and approve this payroll setup.
                  </label>
                  <Feedback error={verify.error} success={verify.isSuccess ? "Payroll verified." : undefined} />
                  <button className="button primary" disabled={!ack || !setup.data || !taxComplete || !bankComplete || verify.isPending || payrollVerified} onClick={() => verify.mutate()}>
                    {verify.isPending ? "Verifying payroll…" : payrollVerified ? "Payroll verified" : "Verify payroll"}
                  </button>
                </>
              ) : (
                <p className="notice">Payroll details are visible to you, but only an authorized HR administrator can verify them.</p>
              )}
            </div>
          </QueryState>
        ) : (
          <Empty title="Select a task to begin" />
        )}
      </Panel>
    </>
  );
}
