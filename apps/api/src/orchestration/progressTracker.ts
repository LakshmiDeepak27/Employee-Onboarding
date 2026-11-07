/**
 * DETERMINISTIC PROGRESS TRACKER
 *
 * Core responsibilities:
 * Computes plan progress and metrics strictly from persisted database task states.
 * Under NO circumstances is an LLM used to calculate completion percentages.
 */

export interface TaskStateSummary {
  id: string;
  taskType: string;
  status: string; // 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'SKIPPED'
  reviewState?: string; // 'OK' | 'NEEDS_REVIEW' | 'ESCALATED' | 'REJECTED'
  isAtRisk?: boolean;
  dueDate: string;
  completedAt?: Date | string | null;
}

export interface PlanProgressMetrics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  atRiskTasks: number;
  needsReviewTasks: number;
  completionPercentage: number;
  dayOneReady: boolean;
  isComplete: boolean;
}

export function calculatePlanProgress(
  tasks: TaskStateSummary[],
  startDateStr?: string,
): PlanProgressMetrics {
  const totalTasks = tasks.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      blockedTasks: 0,
      atRiskTasks: 0,
      needsReviewTasks: 0,
      completionPercentage: 0,
      dayOneReady: false,
      isComplete: false,
    };
  }

  let completedTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  let pendingTasks = 0;
  let atRiskTasks = 0;
  let needsReviewTasks = 0;

  // Day one critical task types that must be satisfied for Day One readiness
  const DAY_ONE_ESSENTIALS = new Set([
    "COLLECT_ID_PROOF",
    "RIGHT_TO_WORK_CHECK",
    "SIGN_EMPLOYMENT_CONTRACT",
    "PROVISION_LAPTOP",
    "CREATE_SYSTEM_ACCOUNTS",
    "PREPARE_DAY_ONE_AGENDA",
  ]);

  let dayOnePendingRisk = false;

  for (const t of tasks) {
    if (t.status === "COMPLETED" || t.status === "SKIPPED") {
      completedTasks += 1;
    } else if (t.status === "IN_PROGRESS") {
      inProgressTasks += 1;
    } else if (t.status === "BLOCKED") {
      blockedTasks += 1;
    } else {
      pendingTasks += 1;
    }

    if (t.isAtRisk) {
      atRiskTasks += 1;
    }

    if (t.reviewState === "NEEDS_REVIEW" || t.reviewState === "ESCALATED") {
      needsReviewTasks += 1;
    }

    if (DAY_ONE_ESSENTIALS.has(t.taskType)) {
      if (t.isAtRisk || t.status === "BLOCKED") {
        dayOnePendingRisk = true;
      }
    }
  }

  const completionPercentage = Math.round((completedTasks / totalTasks) * 100);
  const isComplete = completedTasks === totalTasks;
  const dayOneReady = !dayOnePendingRisk;

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    blockedTasks,
    atRiskTasks,
    needsReviewTasks,
    completionPercentage,
    dayOneReady,
    isComplete,
  };
}

/** Determines next plan status based on approval and execution progress */
export function derivePlanStatus(
  currentStatus: string,
  progress: PlanProgressMetrics,
): string {
  if (currentStatus === "REFUSED") return "REFUSED";
  if (currentStatus === "DRAFT") return "DRAFT";
  if (currentStatus === "AWAITING_APPROVAL") return "AWAITING_APPROVAL";

  // Once approved:
  if (progress.isComplete) {
    return "AWAITING_COMPLETION_APPROVAL";
  }
  if (currentStatus === "AWAITING_COMPLETION_APPROVAL") {
    return "IN_PROGRESS";
  }

  if (progress.completedTasks > 0 || progress.inProgressTasks > 0) {
    return "IN_PROGRESS";
  }

  return currentStatus;
}
