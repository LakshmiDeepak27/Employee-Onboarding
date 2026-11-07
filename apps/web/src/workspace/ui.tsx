import type { ReactNode } from "react";
import { AlertCircle, Inbox, RefreshCw, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
export const human = (value?: string | null) =>
  value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
    : "Not provided";

export function cleanDisplayName(value?: string | null): string {
  if (!value) return "Onboarding task";
  return value
    .replace(/^\s*(?:DEMO|SAMPLE)\s*[—–:-]\s*/i, "")
    .replace(/\s*\(HR review required\)/gi, "")
    .replace(/\s*\(replace with approved [^)]+\)/gi, "")
    .replace(/\s*\(not statutory guidance\)/gi, "")
    .replace(/\s*\(demo\)\s*$/gi, "")
    .replace(/\bDEMO\s*[—–:-]\s*/gi, "")
    .replace(/\bDEMO\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim() || "Onboarding task";
}

export function cleanDisplayDescription(value?: string | null): string {
  if (!value) return "";
  const text = value;
  if (/^Demonstration workflow template/i.test(text)) {
    return "Standard task for the onboarding workflow. Confirm details before completion.";
  }
  if (/^Demonstration (?:configuration|data|only)/i.test(text)) {
    return "Standard organization policy and benefits configuration.";
  }
  if (/^Starter (?:workflow|task|options)/i.test(text)) {
    return text.replace(/HR (?:must|should) confirm.*$/i, "").trim();
  }
  return text
    .replace(/^\s*(?:DEMO|SAMPLE)\s*[—–:-]\s*/i, "")
    .replace(/\s*\(HR review required\)/gi, "")
    .replace(/\s*\(replace with approved [^)]+\)/gi, "")
    .replace(/\s*\(not statutory guidance\)/gi, "")
    .replace(/\bDEMO\s*[—–:-]\s*/gi, "")
    .replace(/\bDEMO\b/gi, "")
    .replace(/\bDemonstration\b/gi, "Standard")
    .replace(/\bdemo\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const displayTaskTitle = cleanDisplayName;
export const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value))
    : "—";
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase().replaceAll("_", "-")}`}>
      <span />
      {human(value)}
    </span>
  );
}
export function Heading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  text = "Records will appear here as your CLYORA onboarding progresses.",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty" role="status">
      <Inbox size={28} strokeWidth={1.75} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function QueryState({
  query,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => unknown;
  };
  children: ReactNode;
}) {
  if (query.isPending)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Loading your workspace…
      </div>
    );
  if (query.isError)
    return (
      <div className="error-state" role="alert">
        <AlertCircle />
        <div>
          <h3>We couldn’t load this information</h3>
          <p>{query.error?.message}</p>
          <button className="button secondary" onClick={() => query.refetch()}>
            <RefreshCw size={15} />
            Try again
          </button>
        </div>
      </div>
    );
  return <>{children}</>;
}
export function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  detail,
  to,
}: {
  label: string;
  value: string | number;
  detail: string;
  to?: string;
}) {
  const content = (
    <>
      <span>
        {label}
        {to && <ArrowUpRight size={16} />}
      </span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );
  return to ? (
    <Link className="metric" to={to}>
      {content}
    </Link>
  ) : (
    <div className="metric">{content}</div>
  );
}
export function Progress({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress-cell">
      <div
        className="progress"
        role="progressbar"
        aria-label="Completion"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>
        {done}/{total}
      </small>
    </div>
  );
}
export function Feedback({
  error,
  success,
}: {
  error?: Error | null;
  success?: string;
}) {
  return (
    <>
      {error && (
        <p className="notice danger" role="alert">
          {error.message}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
    </>
  );
}
