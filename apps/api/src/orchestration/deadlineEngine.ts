/**
 * DETERMINISTIC DEADLINE & SCHEDULING ENGINE
 *
 * Core responsibility:
 * Computes all task due dates, earliest start dates, and lead-time risks
 * using deterministic calendar and business-day math based on jurisdiction rules.
 *
 * Guardrail V6:
 * The LLM is NEVER allowed to set dates directly. The model may propose
 * an offset rule (e.g. START_DATE - 5 business days); this engine calculates
 * the actual date against the authoritative jurisdiction calendar.
 */

export interface CalendarConfig {
  businessDays: number[]; // ISO weekdays 1=Mon, 7=Sun (default [1,2,3,4,5])
  holidays?: (string | Date)[]; // Array of ISO date strings YYYY-MM-DD or Date objects
  timezone?: string;
}

export type DeadlineAnchor = "START_DATE" | "OFFER_DATE" | "PLAN_CREATED";
export type DeadlineBasis = "BUSINESS_DAYS" | "CALENDAR_DAYS";

export interface DeadlineRule {
  anchor: DeadlineAnchor;
  offsetDays: number;
  basis: DeadlineBasis;
  leadTimeDays?: number;
}

export interface DateContext {
  startDate: string | Date;
  offerDate?: string | Date | null;
  planCreatedAt?: string | Date;
  now?: string | Date;
}

export interface ComputedDeadline {
  dueDate: string; // ISO date YYYY-MM-DD
  earliestStartDate: string; // ISO date YYYY-MM-DD
  isAtRisk: boolean;
  riskReason: string | null;
  slackDays: number;
}

/** Formats a date object to YYYY-MM-DD */
export function formatIsoDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a date string or Date object to a UTC Midnight Date */
export function parseUtcDate(input: string | Date): Date {
  if (input instanceof Date) {
    const d = new Date(
      Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
    );
    return d;
  }
  const datePart = typeof input === "string" ? (input.split("T")[0] ?? "") : "";
  const parts = datePart.split("-");
  const y = parseInt(parts[0] ?? "1970", 10);
  const m = parseInt(parts[1] ?? "1", 10) - 1;
  const d = parseInt(parts[2] ?? "1", 10);
  return new Date(Date.UTC(y, m, d));
}

/** Checks if a date is a working business day for the jurisdiction */
export function isBusinessDay(d: Date, config: CalendarConfig): boolean {
  // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat
  // ISO day: 1=Mon ... 7=Sun
  const dayOfWeek = d.getUTCDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

  const validBusinessDays =
    config.businessDays && config.businessDays.length > 0
      ? config.businessDays
      : [1, 2, 3, 4, 5];

  if (!validBusinessDays.includes(isoDay)) {
    return false;
  }

  if (config.holidays && config.holidays.length > 0) {
    const formatted = formatIsoDate(d);
    for (const h of config.holidays) {
      const hStr = h instanceof Date ? formatIsoDate(h) : h.split("T")[0];
      if (formatted === hStr) {
        return false;
      }
    }
  }

  return true;
}

/** Adds or subtracts business or calendar days to a date */
export function addDays(
  baseDate: Date,
  offsetDays: number,
  basis: DeadlineBasis,
  config: CalendarConfig,
): Date {
  const result = new Date(baseDate.getTime());

  if (offsetDays === 0) {
    // If 0 offset on business days, ensure it lands on a business day (roll forward if holiday/weekend)
    if (basis === "BUSINESS_DAYS" && !isBusinessDay(result, config)) {
      while (!isBusinessDay(result, config)) {
        result.setUTCDate(result.getUTCDate() + 1);
      }
    }
    return result;
  }

  if (basis === "CALENDAR_DAYS") {
    result.setUTCDate(result.getUTCDate() + offsetDays);
    return result;
  }

  // BUSINESS_DAYS
  const direction = offsetDays > 0 ? 1 : -1;
  let remaining = Math.abs(offsetDays);

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + direction);
    if (isBusinessDay(result, config)) {
      remaining -= 1;
    }
  }

  return result;
}

/** Calculates business days between two dates (date2 - date1) */
export function countBusinessDays(
  start: Date,
  end: Date,
  config: CalendarConfig,
): number {
  if (start.getTime() === end.getTime()) return 0;

  const direction = end.getTime() > start.getTime() ? 1 : -1;
  const current = new Date(start.getTime());
  let count = 0;

  while (formatIsoDate(current) !== formatIsoDate(end)) {
    current.setUTCDate(current.getUTCDate() + direction);
    if (isBusinessDay(current, config)) {
      count += direction;
    }
  }

  return count;
}

/** Computes task deadline, earliest start date, and evaluates risk */
export function computeTaskDeadline(
  rule: DeadlineRule,
  dates: DateContext,
  config: CalendarConfig,
): ComputedDeadline {
  const now = parseUtcDate(dates.now ?? new Date());
  const startDate = parseUtcDate(dates.startDate);
  const planCreated = parseUtcDate(dates.planCreatedAt ?? now);
  const offerDate = dates.offerDate ? parseUtcDate(dates.offerDate) : null;

  // Resolve anchor
  let anchorDate: Date;
  switch (rule.anchor) {
    case "OFFER_DATE":
      anchorDate = offerDate ?? planCreated;
      break;
    case "PLAN_CREATED":
      anchorDate = planCreated;
      break;
    case "START_DATE":
    default:
      anchorDate = startDate;
      break;
  }

  // Calculate target due date
  const targetDueDate = addDays(
    anchorDate,
    rule.offsetDays,
    rule.basis,
    config,
  );
  const dueDateStr = formatIsoDate(targetDueDate);

  // Calculate earliest start date (default to plan creation date or lead-time backward from due date)
  let earliestStartDate = planCreated;
  if (targetDueDate.getTime() < planCreated.getTime()) {
    earliestStartDate = targetDueDate;
  }
  const earliestStartDateStr = formatIsoDate(earliestStartDate);

  // Evaluate lead-time risk & slack
  const runwayToStart = countBusinessDays(now, startDate, config);
  const leadTimeDays = rule.leadTimeDays ?? 0;
  const daysToDue = countBusinessDays(now, targetDueDate, config);

  let isAtRisk = false;
  let riskReason: string | null = null;

  if (leadTimeDays > 0 && runwayToStart < leadTimeDays) {
    isAtRisk = true;
    riskReason = `Lead time is ${leadTimeDays} business days but start date is in ${Math.max(0, runwayToStart)} business days.`;
  } else if (daysToDue < 0) {
    isAtRisk = true;
    riskReason = `Deadline passed ${Math.abs(daysToDue)} business days ago.`;
  } else if (daysToDue === 0 && runwayToStart <= 0) {
    isAtRisk = true;
    riskReason = "Task is due immediately with no float remaining.";
  }

  return {
    dueDate: dueDateStr,
    earliestStartDate: earliestStartDateStr,
    isAtRisk,
    riskReason,
    slackDays: daysToDue,
  };
}
