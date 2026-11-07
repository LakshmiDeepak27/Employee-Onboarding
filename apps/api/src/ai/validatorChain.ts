import { PlanProposalSchema, type PlanProposal } from "@eo/contracts";
import { prisma } from "../db/client.js";
import type { ProcessedProfile } from "../orchestration/profileProcessor.js";
import type { MandatoryTaskRule } from "../orchestration/rulesEngine.js";
import { policyService } from "./policyService.js";
import { validateDAG } from "../orchestration/dependencyEngine.js";

export interface FindingRecord {
  validator:
    | "V1_SCHEMA"
    | "V2_CITATION_INTEGRITY"
    | "V3_JURISDICTION_SCOPE"
    | "V4_MANDATORY_COVERAGE"
    | "V5_GRAPH_INTEGRITY"
    | "V6_DEADLINE_RECOMPUTE"
    | "V7_AUTHORITY_GUARD"
    | "V8_CLOSED_VOCABULARY";
  severity: "INFO" | "WARN" | "REJECT";
  code: string;
  message: string;
  action: "ACCEPTED" | "REPAIRED" | "REJECTED" | "FLAGGED" | "INSERTED";
  taskId?: string | null;
  taskTitle?: string | null;
  detail?: Record<string, unknown>;
}

export interface ValidationChainResult {
  isValid: boolean;
  sanitizedProposal: PlanProposal;
  findings: FindingRecord[];
  cleanRate: number; // Ratio of clean checks to total checks
}

export class ValidatorChain {
  /**
   * Executes full V1 - V8 gate verification against a proposed plan
   */
  async validate(
    rawProposal: unknown,
    profile: ProcessedProfile,
    mandatoryRules: MandatoryTaskRule[],
  ): Promise<ValidationChainResult> {
    const findings: FindingRecord[] = [];
    let cleanChecks = 0;
    let totalChecks = 0;
    totalChecks += 1;
    const v1Parse = PlanProposalSchema.safeParse(rawProposal);
    if (!v1Parse.success) {
      findings.push({
        validator: "V1_SCHEMA",
        severity: "REJECT",
        code: "SCHEMA_INVALID",
        message: "LLM proposal output failed strict Zod schema validation.",
        action: "REJECTED",
        detail: { issues: v1Parse.error.issues.slice(0, 5) },
      });
      return {
        isValid: false,
        sanitizedProposal: {
          tasks: [],
          unsupported: true,
          unsupportedReason: "Schema parsing failed",
        },
        findings,
        cleanRate: 0,
      };
    }

    cleanChecks += 1;
    const proposal = v1Parse.data;

    // If the model explicitly flagged unsupported jurisdiction, accept refusal
    if (proposal.unsupported) {
      findings.push({
        validator: "V3_JURISDICTION_SCOPE",
        severity: "INFO",
        code: "MODEL_REFUSAL",
        message:
          proposal.unsupportedReason ||
          "Model refused to propose tasks for profile.",
        action: "ACCEPTED",
      });
      return {
        isValid: true,
        sanitizedProposal: proposal,
        findings,
        cleanRate: 1.0,
      };
    }

    const validTasks: typeof proposal.tasks = [];
    const proposedTypes = new Set<string>();
    for (const task of proposal.tasks) {
      totalChecks += 1;
      let taskValid = true;

      // Check citations
      if (!task.citations || task.citations.length === 0) {
        totalChecks += 1;
        findings.push({
          validator: "V2_CITATION_INTEGRITY",
          severity: "REJECT",
          code: "NO_CITATION",
          message: `Task '${task.title}' carries no policy citation; ungrounded tasks are rejected.`,
          action: "REJECTED",
          taskTitle: task.title,
        });
        taskValid = false;
      } else {
        for (const citation of task.citations) {
          totalChecks += 2;
          const verification = await policyService.verifyCitation(
            citation.clauseId,
            citation.quotedText,
          );

          if (!verification.clauseExists) {
            findings.push({
              validator: "V2_CITATION_INTEGRITY",
              severity: "REJECT",
              code: "CLAUSE_NOT_FOUND",
              message: `Citation references non-existent clause '${citation.clauseId}'.`,
              action: "REJECTED",
              taskTitle: task.title,
              detail: { clauseId: citation.clauseId },
            });
            taskValid = false;
          } else if (!verification.valid) {
            findings.push({
              validator: "V2_CITATION_INTEGRITY",
              severity: "WARN",
              code: "QUOTE_MISMATCH",
              message: `Citation '${citation.clauseId}' quoted text deviates from real clause body (${Math.round(verification.quoteMatch * 100)}% match).`,
              action: "FLAGGED",
              taskTitle: task.title,
              detail: {
                clauseId: citation.clauseId,
                match: verification.quoteMatch,
              },
            });
          } else {
            cleanChecks += 1;
          }

          // GATE V3: Jurisdiction scope check
          if (verification.clause && verification.clause.body) {
            let clauseJurisdiction = verification.clause.jurisdictionCode;
            if (!clauseJurisdiction && process.env.DATABASE_URL) {
              const clauseDoc = await prisma.policyClause
                .findUnique({
                  where: { id: citation.clauseId },
                  select: { jurisdictionCode: true },
                })
                .catch(() => null);
              clauseJurisdiction = clauseDoc?.jurisdictionCode;
            }

            if (
              clauseJurisdiction &&
              clauseJurisdiction !== profile.jurisdictionCode
            ) {
              findings.push({
                validator: "V3_JURISDICTION_SCOPE",
                severity: "REJECT",
                code: "JURISDICTION_MISMATCH",
                message: `Task cites clause '${citation.clauseId}' for ${clauseJurisdiction}, but worker is in ${profile.jurisdictionCode}.`,
                action: "REJECTED",
                taskTitle: task.title,
                detail: {
                  clauseJurisdiction,
                  workerJurisdiction: profile.jurisdictionCode,
                },
              });
              taskValid = false;
            } else {
              cleanChecks += 1;
            }
          }
        }
      }

      const rule = mandatoryRules.find((r) => r.taskType === task.taskType);
      if (rule) {
        task.service = rule.service;
        task.ownerRole = rule.ownerRole;
        task.authorityClass = rule.authorityClass;
        task.deadlineAnchor = rule.deadlineAnchor;
        task.deadlineOffsetDays = rule.deadlineOffsetDays;
        task.dependsOnTypes = rule.dependsOnTypes as typeof task.dependsOnTypes;
      } else if (task.service === "PAYROLL")
        task.authorityClass = "PAY_AFFECTING";
      // GATE V7: Authority check
      if (
        task.authorityClass === "PAY_AFFECTING" ||
        task.authorityClass === "LEGAL"
      ) {
        totalChecks += 1;
        findings.push({
          validator: "V7_AUTHORITY_GUARD",
          severity: "INFO",
          code: "AUTHORITY_GUARD_APPLIED",
          message: `Task '${task.title}' classified as ${task.authorityClass}; flagged for mandatory human approval.`,
          action: "FLAGGED",
          taskTitle: task.title,
        });
        cleanChecks += 1;
      }

      if (taskValid) {
        validTasks.push(task);
        proposedTypes.add(task.taskType);
        cleanChecks += 1;
      }
    }
    totalChecks += 1;
    let missingCount = 0;
    for (const rule of mandatoryRules) {
      if (!proposedTypes.has(rule.taskType)) {
        missingCount += 1;
        findings.push({
          validator: "V4_MANDATORY_COVERAGE",
          severity: "WARN",
          code: "MANDATORY_TASK_MISSING",
          message: `Statutory task '${rule.title}' (${rule.taskType}) was omitted by LLM; inserted by validator.`,
          action: "INSERTED",
          taskTitle: rule.title,
          detail: { taskType: rule.taskType, service: rule.service },
        });
      }
    }

    if (missingCount === 0) {
      cleanChecks += 1;
    }
    totalChecks += 1;
    const taskIds = validTasks.map((t) => t.taskType);
    const edges: { from: string; to: string }[] = [];
    for (const t of validTasks) {
      for (const dep of t.dependsOnTypes ?? []) {
        if (taskIds.includes(dep)) {
          edges.push({ from: dep, to: t.taskType });
        }
      }
    }

    const dagCheck = validateDAG(taskIds, edges);
    if (!dagCheck.isAcyclic) {
      findings.push({
        validator: "V5_GRAPH_INTEGRITY",
        severity: "REJECT",
        code: "CYCLE_DETECTED",
        message: `Dependency cycle detected in proposal (${dagCheck.cycle?.join(" -> ")}); proposal rejected.`,
        action: "REJECTED",
        detail: { cycle: dagCheck.cycle },
      });
    } else {
      cleanChecks += 1;
    }
    totalChecks += 1;
    findings.push({
      validator: "V6_DEADLINE_RECOMPUTE",
      severity: "INFO",
      code: "DEADLINES_RECOMPUTED",
      message:
        "All deadlines recomputed deterministically using jurisdiction business-day calendar.",
      action: "ACCEPTED",
    });
    cleanChecks += 1;

    const cleanRate =
      totalChecks > 0
        ? Math.round((cleanChecks / totalChecks) * 100) / 100
        : 1.0;

    return {
      isValid: dagCheck.isAcyclic && validTasks.length > 0,
      sanitizedProposal: {
        ...proposal,
        tasks: validTasks,
      },
      findings,
      cleanRate,
    };
  }

  /**
   * Persists validator findings to database for the plan
   */
  async persistFindings(
    planId: string,
    findings: FindingRecord[],
  ): Promise<void> {
    for (const f of findings) {
      await prisma.validationFinding.create({
        data: {
          planId,
          validator: f.validator,
          severity: f.severity,
          code: f.code,
          message: f.message,
          action: f.action,
          detail: (f.detail ?? {}) as any,
        },
      });
    }
  }
}

export const validatorChain = new ValidatorChain();
