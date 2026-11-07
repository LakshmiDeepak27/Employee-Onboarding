import { randomUUID } from "crypto";
import type { ProcessedProfile } from "./profileProcessor.js";
import type { MandatoryTaskRule } from "./rulesEngine.js";
import {
  computeTaskDeadline,
  type CalendarConfig,
  type DateContext,
} from "./deadlineEngine.js";
import {
  validateDAG,
  calculateDepths,
  calculateCriticalPath,
} from "./dependencyEngine.js";

export interface GeneratedCitation {
  id: string;
  clauseId: string;
  quotedText: string;
  quoteMatch: number;
  retrievalRank?: number | null;
  retrievalScore?: number | null;
}

export interface GeneratedTask {
  id: string;
  planId: string;
  taskType: any;
  service: any;
  title: string;
  description: string | null;
  ownerRole: any;
  assigneeUserId: string | null;
  dueDate: Date;
  earliestStartDate: Date;
  authorityClass: any;
  origin:
    | "TEMPLATE"
    | "LLM_ACCEPTED"
    | "LLM_REPAIRED"
    | "VALIDATOR_INSERTED"
    | "HUMAN_ADDED";
  reviewState: "OK" | "NEEDS_REVIEW" | "ESCALATED" | "REJECTED";
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "SKIPPED";
  isAtRisk: boolean;
  riskReason: string | null;
  onCriticalPath: boolean;
  sortOrder: number;
  dependsOnTaskTypes: string[];
  dependsOnIds: string[];
  citations: GeneratedCitation[];
}

export interface TaskGenerationResult {
  tasks: GeneratedTask[];
  dependencies: { taskId: string; dependsOnId: string }[];
  topologicalOrder: string[];
  criticalPath: string[];
  criticalPathLengthDays: number;
}

export interface ProposedLlmTaskInput {
  taskType: string;
  service: string;
  title: string;
  description?: string;
  ownerRole: string;
  authorityClass: string;
  deadlineAnchor: string;
  deadlineOffsetDays: number;
  dependsOnTypes: string[];
  citations: {
    clauseId: string;
    quotedText: string;
    quoteMatch?: number;
  }[];
}

/**
 * Synthesizes final task graph for an onboarding plan
 */
export function generatePlanTasks(
  planId: string,
  profile: ProcessedProfile,
  mandatoryRules: MandatoryTaskRule[],
  proposedTasks: ProposedLlmTaskInput[] = [],
  generationMode: "LLM_GROUNDED" | "BASELINE_FALLBACK" = "BASELINE_FALLBACK",
): TaskGenerationResult {
  // Defense in depth: the current onboarding workflow only creates work owned
  // by HR or the reporting Manager, even if an AI provider returns other roles.
  const eligibleOwnerRules = mandatoryRules.filter(
    (rule) => rule.ownerRole === "HR" || rule.ownerRole === "MANAGER",
  );
  const eligibleTaskTypes = new Set(eligibleOwnerRules.map((rule) => rule.taskType));
  const eligibleRules = eligibleOwnerRules.map((rule) => ({
    ...rule,
    // A scoped plan cannot depend on work intentionally omitted from it.
    dependsOnTypes: rule.dependsOnTypes.filter((taskType) =>
      eligibleTaskTypes.has(taskType),
    ),
  }));
  const calendarConfig: CalendarConfig = {
    businessDays: profile.businessDays,
    timezone: profile.timezone,
  };

  const dateContext: DateContext = {
    startDate: profile.startDate,
    offerDate: profile.offerDate,
    planCreatedAt: new Date(),
    now: new Date(),
  };

  const taskMap = new Map<string, GeneratedTask>();
  const taskTypeToId = new Map<string, string>();

  // 1. Process LLM proposals first if in LLM_GROUNDED mode
  if (generationMode === "LLM_GROUNDED") {
    for (const proposal of proposedTasks) {
      if (taskMap.has(proposal.taskType)) continue;
      // Only permit AI to refine a task already approved by the deterministic
      // rule catalog. This prevents invented task types/owners from entering a
      // plan while preserving generated descriptions and policy citations.
      const rule = eligibleRules.find((r) => r.taskType === proposal.taskType);
      if (!rule) continue;
      const p = {
        ...proposal,
        service: rule.service,
        ownerRole: rule.ownerRole,
        authorityClass: rule.authorityClass,
        deadlineAnchor: rule.deadlineAnchor,
        deadlineOffsetDays: rule.deadlineOffsetDays,
        dependsOnTypes: rule.dependsOnTypes,
      };
      const taskId = randomUUID();
      taskTypeToId.set(p.taskType, taskId);

      // Deadlines are ALWAYS computed by code (guardrail V6)
      const computed = computeTaskDeadline(
        {
          anchor: p.deadlineAnchor as any,
          offsetDays: p.deadlineOffsetDays,
          basis: rule?.deadlineBasis ?? "BUSINESS_DAYS",
          leadTimeDays: rule?.leadTimeDays ?? 0,
        },
        dateContext,
        calendarConfig,
      );

      // Authority guardrail V7: PAY_AFFECTING and LEGAL tasks must be reviewed
      const isSensitive =
        p.authorityClass === "PAY_AFFECTING" || p.authorityClass === "LEGAL";

      taskMap.set(p.taskType, {
        id: taskId,
        planId,
        taskType: p.taskType,
        service: p.service,
        title: p.title,
        description: p.description ?? null,
        ownerRole: p.ownerRole,
        assigneeUserId: null,
        dueDate: new Date(computed.dueDate),
        earliestStartDate: new Date(computed.earliestStartDate),
        authorityClass: p.authorityClass,
        origin: "LLM_ACCEPTED",
        reviewState: isSensitive ? "NEEDS_REVIEW" : "OK",
        status: "NOT_STARTED",
        isAtRisk: computed.isAtRisk,
        riskReason: computed.riskReason,
        onCriticalPath: false,
        sortOrder: 0,
        dependsOnTaskTypes: p.dependsOnTypes ?? [],
        dependsOnIds: [],
        citations: (p.citations ?? []).map((c) => ({
          id: randomUUID(),
          clauseId: c.clauseId,
          quotedText: c.quotedText,
          quoteMatch: c.quoteMatch ?? 1.0,
        })),
      });
    }
  }

  // 2. Ensure every eligible deterministic rule from the Rules Engine is covered
  // (Guardrail V4: Mandatory Coverage — insert if missing)
  for (const rule of eligibleRules) {
    if (!taskMap.has(rule.taskType)) {
      const taskId = randomUUID();
      taskTypeToId.set(rule.taskType, taskId);

      const computed = computeTaskDeadline(
        {
          anchor: rule.deadlineAnchor,
          offsetDays: rule.deadlineOffsetDays,
          basis: rule.deadlineBasis,
          leadTimeDays: rule.leadTimeDays,
        },
        dateContext,
        calendarConfig,
      );

      const isSensitive =
        rule.authorityClass === "PAY_AFFECTING" ||
        rule.authorityClass === "LEGAL";

      taskMap.set(rule.taskType, {
        id: taskId,
        planId,
        taskType: rule.taskType,
        service: rule.service,
        title: rule.title,
        description: rule.description,
        ownerRole: rule.ownerRole,
        assigneeUserId: null,
        dueDate: new Date(computed.dueDate),
        earliestStartDate: new Date(computed.earliestStartDate),
        authorityClass: rule.authorityClass,
        origin:
          generationMode === "LLM_GROUNDED" ? "VALIDATOR_INSERTED" : "TEMPLATE",
        reviewState: isSensitive ? "NEEDS_REVIEW" : "OK",
        status: "NOT_STARTED",
        isAtRisk: computed.isAtRisk,
        riskReason: computed.riskReason,
        onCriticalPath: false,
        sortOrder: 0,
        dependsOnTaskTypes: rule.dependsOnTypes,
        dependsOnIds: [],
        citations: rule.sourceClauseId
          ? [
              {
                id: randomUUID(),
                clauseId: rule.sourceClauseId,
                quotedText: rule.title,
                quoteMatch: 1.0,
              },
            ]
          : [],
      });
    } else {
      // If task already exists from LLM, ensure mandatory dependencies from template are merged
      const existing = taskMap.get(rule.taskType)!;
      const combinedDeps = new Set([
        ...existing.dependsOnTaskTypes,
        ...rule.dependsOnTypes,
      ]);
      existing.dependsOnTaskTypes = Array.from(combinedDeps);
    }
  }

  // 3. Resolve dependency IDs from task types
  const taskList = Array.from(taskMap.values());
  const edges: { from: string; to: string }[] = [];

  for (const task of taskList) {
    const depIds: string[] = [];
    for (const depType of task.dependsOnTaskTypes) {
      const depId = taskTypeToId.get(depType);
      if (!depId) {
        throw new Error(`Task ${task.taskType} depends on missing task type ${depType}; plan generation refused.`);
      }
      if (depId && depId !== task.id) {
        depIds.push(depId);
        edges.push({ from: depId, to: task.id });
      }
    }
    task.dependsOnIds = depIds;
  }

  // 4. Validate DAG and perform topological sorting
  const taskIds = taskList.map((t) => t.id);
  const dagResult = validateDAG(taskIds, edges);

  if (!dagResult.isAcyclic)
    throw new Error(
      "Plan dependency graph contains a cycle; generation refused.",
    );
  const finalTopologicalOrder = dagResult.topologicalOrder;

  // 5. Compute visual depth layers & critical path
  const depthMap = calculateDepths(finalTopologicalOrder, edges);
  for (const task of taskList) {
    task.sortOrder = depthMap.get(task.id) ?? 0;
  }

  const cpResult = calculateCriticalPath(
    taskList.map((t) => ({
      id: t.id,
      taskType: t.taskType,
      title: t.title,
      dueDate: t.dueDate.toISOString().slice(0, 10),
      earliestStartDate: t.earliestStartDate.toISOString().slice(0, 10),
    })),
    edges,
    finalTopologicalOrder,
  );

  const criticalSet = new Set(cpResult.criticalPath);
  for (const task of taskList) {
    if (criticalSet.has(task.id)) {
      task.onCriticalPath = true;
    }
  }

  const dependencies = edges.map((e) => ({
    taskId: e.to,
    dependsOnId: e.from,
  }));

  return {
    tasks: taskList,
    dependencies,
    topologicalOrder: finalTopologicalOrder,
    criticalPath: cpResult.criticalPath,
    criticalPathLengthDays: cpResult.pathLengthDays,
  };
}
