import { configuredModel } from "../ai/llmClient.js";
import type { FindingRecord } from "../ai/validatorChain.js";
import { randomUUID } from "node:crypto";
import {
  prisma,
  isDatabaseOnline,
  setDatabaseOnline,
  databaseUnavailableError,
  type Prisma,
} from "../db/client.js";
import { notFound, conflict, badRequest, AppError } from "../lib/errors.js";
import { processEmployeeProfile } from "./profileProcessor.js";
import { evaluateRules } from "./rulesEngine.js";
import { generatePlanTasks } from "./taskGenerator.js";
import { calculatePlanProgress, derivePlanStatus } from "./progressTracker.js";
import { isTaskReadyForDispatch, calculateDepths } from "./dependencyEngine.js";

export interface GeneratePlanOptions {
  forceBaseline?: boolean;
  regenerate?: boolean;
  actorUserId?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ApprovePlanInput {
  decision: "APPROVE" | "REJECT";
  taskIds?: string[];
  reason?: string;
  acknowledgement: boolean;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  requestId?: string | null;
}

export interface FinalizeOnboardingInput {
  actorUserId: string;
  actorName: string;
  actorRole: string;
  reason?: string;
  requestId?: string | null;
}

export const IN_MEMORY_PLANS: Map<string, any> = new Map();

export class OnboardingOrchestrator {
  /**
   * Generates or regenerates an onboarding plan for an employee
   */
  async generatePlan(employeeId: string, options: GeneratePlanOptions = {}) {
    if (!isDatabaseOnline()) {
      throw new AppError(503, "UPSTREAM_UNAVAILABLE", "The onboarding database is unavailable. No plan was created.");
    }
    // Stage 1: Profile Intake & Jurisdiction Resolution
    const eligibility = await processEmployeeProfile(employeeId);
    const { profile } = eligibility;

    // Check if employee already has an active plan
    let existingPlan: any = null;
    {
      try {
        existingPlan = await prisma.onboardingPlan.findFirst({
          where: {
            employeeId,
            status: { notIn: ["REFUSED", "COMPLETED"] },
          },
          include: { tasks: true },
        });
      } catch {
        setDatabaseOnline(false);
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Could not load the existing onboarding plan. No plan was created.");
      }
    }
    if (existingPlan && !options.regenerate) {
      throw conflict(
        `An active onboarding plan already exists for this employee (${existingPlan.id}). Use regenerate=true to overwrite.`,
      );
    }

    if (
      existingPlan &&
      options.regenerate &&
      !["DRAFT", "AWAITING_APPROVAL"].includes(existingPlan.status)
    ) {
      throw conflict(
        "Only draft plans or plans awaiting approval can be regenerated.",
      );
    }

    // Refusal handling: If jurisdiction is unsupported, persist a REFUSED plan and an escalation
    if (!eligibility.eligible) {
      const planId = randomUUID();
      const refusalPlan: any = {
        id: planId,
        employeeId,
        status: "REFUSED",
        generationMode: "BASELINE_FALLBACK",
        refusalReason:
          eligibility.refusalReason ??
          "Unsupported jurisdiction without approved policy corpus.",
        tasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      IN_MEMORY_PLANS.set(planId, refusalPlan);

      {
        try {
          await prisma.$transaction(async (tx) => {
            if (existingPlan && options.regenerate) {
              await tx.onboardingPlan.delete({
                where: { id: existingPlan.id },
              });
            }

            const plan = await tx.onboardingPlan.create({
              data: {
                id: planId,
                employeeId,
                status: "REFUSED",
                generationMode: "BASELINE_FALLBACK",
                refusalReason:
                  eligibility.refusalReason ??
                  "Unsupported jurisdiction without approved policy corpus.",
                createdById: options.actorUserId ?? null,
              },
            });

            await tx.escalation.create({
              data: {
                planId: plan.id,
                reasonCode: "UNSUPPORTED_JURISDICTION",
                detail:
                  eligibility.refusalReason ??
                  `No policy corpus for ${profile.jurisdictionCode}`,
                assignedRole: "COMPLIANCE",
                status: "OPEN",
                raisedById: options.actorUserId ?? null,
              },
            });

            await tx.auditEvent.create({
              data: {
                actorUserId: options.actorUserId ?? null,
                actorRole: options.actorRole ?? "SYSTEM",
                action: "plan.refused",
                resourceType: "OnboardingPlan",
                resourceId: plan.id,
                reason: eligibility.refusalReason,
                requestId: options.requestId ?? null,
              },
            });

            return plan;
          });
        } catch {
          setDatabaseOnline(false);
          IN_MEMORY_PLANS.delete(planId);
          throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Could not save the escalation record. The refusal was not recorded; try again when the database is available.");
        }
      }

      return {
        planId: refusalPlan.id,
        status: "REFUSED",
        refusalReason: refusalPlan.refusalReason,
        plan: refusalPlan,
      };
    }

    // Stage 2: Deterministic Statutory Floor
    const mandatoryRules = await evaluateRules(profile);
    const requiredServices = ["DOCUMENTS", "EQUIPMENT", "PAYROLL", "BENEFITS", "TRAINING", "MANAGER"] as const;
    const missingServices = requiredServices.filter((service) =>
      profile.employmentType === "CONTRACTOR" && service === "BENEFITS"
        ? false
        : !mandatoryRules.some((rule) => rule.service === service),
    );
    if (missingServices.length) {
      const detail = `No eligible approved template exists for: ${missingServices.join(", ")}. Configure the templates before generating this plan.`;
      try {
        await prisma.escalation.create({ data: { reasonCode: "MISSING_TEMPLATES", detail, assignedRole: "HR" } });
      } catch (error) {
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Required templates are missing, and the escalation could not be recorded. No plan was created.", { cause: error });
      }
      throw conflict(`Plan generation refused: missing templates for ${missingServices.join(", ")}. An HR escalation was created.`, "MISSING_TEMPLATES");
    }

    // Stage 3 & 4: LLM Proposal or Baseline Fallback
    let generationMode: "LLM_GROUNDED" | "BASELINE_FALLBACK" =
      "BASELINE_FALLBACK";
    let proposedTasks: any[] = [];
    let findings: FindingRecord[] = [];
    let degradedReason: string | null = null;
    let confidence: number = 1.0;
    let confidenceBreakdown = {
      citationQuoteMatch: 1.0,
      retrievalScore: 1.0,
      templateCorroboration: 1.0,
      validatorCleanRate: 1.0,
      schemaFirstPass: 1.0,
    };

    if (options.forceBaseline) {
      generationMode = "BASELINE_FALLBACK";
      degradedReason =
        "Force baseline requested by caller. Built strictly from task templates.";
    } else {
      // AI RAG generation path: dynamically import AI pipeline if configured
      try {
        const { runAiPlanGeneration } =
          await import("../ai/ragPipeline.js").catch(() => ({
            runAiPlanGeneration: null,
          }));
        if (runAiPlanGeneration) {
          const aiResult = await runAiPlanGeneration(profile, mandatoryRules);
          findings = aiResult?.findings ?? [];
          if (aiResult && aiResult.success && aiResult.tasks.length > 0) {
            generationMode = "LLM_GROUNDED";
            proposedTasks = aiResult.tasks;
            confidence = aiResult.confidence ?? 0.95;
            confidenceBreakdown =
              aiResult.confidenceBreakdown ?? confidenceBreakdown;
          } else {
            generationMode = "BASELINE_FALLBACK";
            degradedReason =
              aiResult?.error ??
              "LLM output did not pass validation; used baseline floor.";
          }
        } else {
          generationMode = "BASELINE_FALLBACK";
          degradedReason =
            "AI provider not initialized; baseline statutory plan generated.";
        }
      } catch (err: any) {
        generationMode = "BASELINE_FALLBACK";
        degradedReason = `AI generation unavailable (${err.message}); baseline statutory plan generated.`;
      }
    }

    // Stage 5 & 6: Task, Graph, and Risk Generation
    const finalPlanId =
      existingPlan && options.regenerate ? existingPlan.id : randomUUID();

    // Generate task structures and dependency DAG
    const generated = generatePlanTasks(
      finalPlanId,
      profile,
      mandatoryRules,
      proposedTasks,
      generationMode,
    );

    const memPlan: any = {
      id: finalPlanId,
      employeeId,
      status: "AWAITING_APPROVAL",
      generationMode,
      confidence,
      confidenceBreakdown,
      modelName: generationMode === "LLM_GROUNDED" ? configuredModel() : null,
      promptVersion:
        generationMode === "LLM_GROUNDED" ? "plan-proposal@v4" : null,
      createdById: options.actorUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        jurisdictionCode: profile.jurisdictionCode,
        startDate: profile.startDate,
      },
      tasks: generated.tasks.map((t) => ({
        ...t,
        dependencies: generated.dependencies
          .filter((d) => d.taskId === t.id)
          .map((d) => ({ taskId: d.taskId, dependsOnId: d.dependsOnId })),
        citations: t.citations.map((c) => ({
          ...c,
          clause: {
            heading: c.clauseId,
            document: { title: "Policy Document", isMock: true },
          },
        })),
      })),
    };

    IN_MEMORY_PLANS.set(finalPlanId, memPlan);

    // Link active plan to in-memory employee
    const { IN_MEMORY_EMPLOYEES } =
      await import("../routes/employees.js").catch(() => ({
        IN_MEMORY_EMPLOYEES: new Map(),
      }));
    const memEmp = IN_MEMORY_EMPLOYEES.get(employeeId);
    if (memEmp) {
      memEmp.plans = [{ id: finalPlanId }];
      memEmp.status = "ONBOARDING";
    }

    // Persist the plan and audit data before reporting a successful job.
    {
      try {
        await prisma.$transaction(
          async (tx) => {
            if (existingPlan && options.regenerate) {
              await tx.planTaskDependency.deleteMany({
                where: {
                  OR: [
                    { task: { planId: existingPlan.id } },
                    { dependsOn: { planId: existingPlan.id } },
                  ],
                },
              });
              await tx.taskCitation.deleteMany({
                where: { task: { planId: existingPlan.id } },
              });
              await tx.validationFinding.deleteMany({
                where: { planId: existingPlan.id },
              });
              await tx.planTask.deleteMany({
                where: { planId: existingPlan.id },
              });
              await tx.onboardingPlan.delete({
                where: { id: existingPlan.id },
              });
            }

            const plan = await tx.onboardingPlan.create({
              data: {
                id: finalPlanId,
                employeeId,
                status: "AWAITING_APPROVAL",
                generationMode,
                confidence,
                confidenceBreakdown,
                modelName:
                  generationMode === "LLM_GROUNDED" ? configuredModel() : null,
                promptVersion:
                  generationMode === "LLM_GROUNDED" ? "plan-proposal@v4" : null,
                createdById: options.actorUserId ?? null,
              },
            });

            for (const t of generated.tasks) {
              await tx.planTask.create({
                data: {
                  id: t.id,
                  planId: plan.id,
                  taskType: t.taskType,
                  service: t.service,
                  title: t.title,
                  description: t.description,
                  ownerRole: t.ownerRole,
                  dueDate: t.dueDate,
                  earliestStartDate: t.earliestStartDate,
                  authorityClass: t.authorityClass,
                  origin: t.origin,
                  reviewState: t.reviewState,
                  status: t.status,
                  isAtRisk: t.isAtRisk,
                  riskReason: t.riskReason,
                  onCriticalPath: t.onCriticalPath,
                  sortOrder: t.sortOrder,
                },
              });

              for (const c of t.citations) {
                const clause = await tx.policyClause.findUnique({
                  where: { id: c.clauseId },
                });
                if (clause) {
                  await tx.taskCitation.create({
                    data: {
                      id: c.id,
                      taskId: t.id,
                      clauseId: c.clauseId,
                      quotedText:
                        t.origin === "LLM_ACCEPTED"
                          ? c.quotedText
                          : clause.body.slice(0, 600),
                      quoteMatch:
                        t.origin === "LLM_ACCEPTED" ? c.quoteMatch : 1,
                    },
                  });
                }
              }
            }

            for (const dep of generated.dependencies) {
              await tx.planTaskDependency.create({
                data: {
                  taskId: dep.taskId,
                  dependsOnId: dep.dependsOnId,
                },
              });
            }

            if (findings.length)
              await tx.validationFinding.createMany({
                data: findings.map((f) => ({
                  planId: plan.id,
                  validator: f.validator,
                  severity: f.severity,
                  code: f.code,
                  message: f.message,
                  action: f.action,
                  detail: (f.detail ?? {}) as Prisma.InputJsonValue,
                })),
              });

            await tx.auditEvent.create({
              data: {
                actorUserId: options.actorUserId ?? null,
                actorRole: options.actorRole ?? "SYSTEM",
                action: "plan.generated",
                resourceType: "OnboardingPlan",
                resourceId: plan.id,
                reason:
                  generationMode === "BASELINE_FALLBACK"
                    ? degradedReason
                    : "Generated via validated LLM proposal",
                requestId: options.requestId ?? null,
                after: {
                  generationMode,
                  taskCount: generated.tasks.length,
                  criticalPathLength: generated.criticalPathLengthDays,
                },
              },
            });
          },
          { timeout: 60000 },
        );
      } catch (error) {
        console.error("Plan persistence failed", error);
        setDatabaseOnline(false);
        IN_MEMORY_PLANS.delete(finalPlanId);
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Could not save the onboarding plan. No plan was created; try again when the database is available.", { cause: error });
      }
    }

    return {
      planId: finalPlanId,
      status: memPlan.status,
      generationMode: memPlan.generationMode,
      degradedReason,
    };
  }

  /**
   * Approves an onboarding plan and dispatches eligible tasks
   * (Guardrail V7: Human Authorization Gate)
   */
  async approvePlan(planId: string, input: ApprovePlanInput) {
    if (!isDatabaseOnline()) {
      throw new AppError(503, "UPSTREAM_UNAVAILABLE", "The onboarding database is unavailable. Approval was not saved.");
    }
    const plan = await prisma.onboardingPlan.findUnique({
      where: { id: planId },
      include: {
        tasks: {
          include: {
            dependencies: true,
          },
        },
      },
    });

    if (!plan) throw notFound(`Plan with ID ${planId}`);

    if (plan.status !== "AWAITING_APPROVAL" && plan.status !== "DRAFT") {
      throw conflict(
        `Plan cannot be approved in its current status (${plan.status})`,
      );
    }

    if (!input.acknowledgement) {
      throw badRequest(
        "Explicit acknowledgement of review is required to approve an onboarding plan.",
      );
    }

    if (input.decision === "REJECT") {
      if (!input.reason?.trim())
        throw badRequest("A rejection reason is required.");
      await prisma.$transaction(async (tx) => {
        await tx.onboardingPlan.update({
          where: { id: planId },
          data: { status: "DRAFT", approvedAt: null, approvedById: null },
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            action: "plan.rejected",
            resourceType: "OnboardingPlan",
            resourceId: planId,
            reason: input.reason,
            requestId: input.requestId ?? null,
            after: { status: "DRAFT" },
          },
        });
      });
      return {
        planId,
        status: "DRAFT",
        approvedTaskIds: [],
        dispatchedTaskIds: [],
        approvedBy: input.actorName,
        approvedAt: new Date().toISOString(),
      };
    }

    // Guardrail V7: Check for any unreviewed sensitive tasks (PAY_AFFECTING or LEGAL)
    const blockingTasks = plan.tasks.filter(
      (t: any) =>
        (t.authorityClass === "PAY_AFFECTING" ||
          t.authorityClass === "LEGAL") &&
        t.reviewState === "NEEDS_REVIEW",
    );

    // If specific taskIds were provided for approval, only check those; otherwise check all
    const relevantBlockers = input.taskIds
      ? blockingTasks.filter((t: any) => input.taskIds!.includes(t.id))
      : blockingTasks;

    if (relevantBlockers.length > 0) {
      throw new AppError(
        409,
        "APPROVAL_BLOCKED",
        "Approval blocked: sensitive PAY_AFFECTING or LEGAL tasks require explicit review before dispatch.",
        {
          fields: relevantBlockers.map((b: any) => ({
            path: b.id,
            message: `${b.taskType} (${b.authorityClass}) is in NEEDS_REVIEW state`,
          })),
        },
      );
    }

    const tasksToApprove = input.taskIds
      ? plan.tasks.filter((t: any) => input.taskIds!.includes(t.id))
      : plan.tasks;

    const taskStatusMap: Map<string, string> = new Map(
      plan.tasks.map((t: any) => [t.id, t.status]),
    );
    const allDependencies = plan.tasks.flatMap((t: any) =>
      (t.dependencies ?? []).map((d: any) => ({
        taskId: d.taskId,
        dependsOnId: d.dependsOnId,
      })),
    );

    // Determine which tasks can be dispatched immediately (have 0 incomplete dependencies)
    const dispatchedTaskIds: string[] = [];

    for (const t of tasksToApprove) {
      if (isTaskReadyForDispatch(t.id, allDependencies, taskStatusMap)) {
        dispatchedTaskIds.push(t.id);
      }
    }

    const approvedAt = new Date();

    await prisma.$transaction(async (tx) => {
          await tx.planTask.updateMany({
            where: { id: { in: tasksToApprove.map((t: any) => t.id) } },
            data: { reviewState: "OK" },
          });
          await tx.planTask.updateMany({
            where: { id: { in: dispatchedTaskIds } },
            data: { status: "NOT_STARTED" },
          });
          for (const t of tasksToApprove.filter((task: any) => dispatchedTaskIds.includes(task.id)))
            await this.initializeDownstreamWorkflow(tx, t, plan.employeeId);

          // Update plan status
          await tx.onboardingPlan.update({
            where: { id: planId },
            data: {
              status: "APPROVED",
              approvedById: input.actorUserId,
              approvedAt,
            },
          });

          // Update employee status to ONBOARDING if PRE_HIRE
          await tx.employee.update({
            where: { id: plan.employeeId },
            data: { status: "ONBOARDING" },
          });

          // Audit event
          await tx.auditEvent.create({
            data: {
              actorUserId: input.actorUserId,
              actorRole: input.actorRole,
              action: "plan.approved",
              resourceType: "OnboardingPlan",
              resourceId: planId,
              reason: input.reason ?? "HR Admin plan review approved",
              requestId: input.requestId ?? null,
              after: {
                approvedTaskCount: tasksToApprove.length,
                dispatchedTaskCount: dispatchedTaskIds.length,
                approvedAt: approvedAt.toISOString(),
              },
            },
          });
        });

    return {
      planId,
      status: "APPROVED",
      approvedTaskIds: tasksToApprove.map((t: any) => t.id),
      dispatchedTaskIds,
      approvedBy: input.actorName,
      approvedAt: approvedAt.toISOString(),
    };
  }

  async finalizeOnboarding(planId: string, input: FinalizeOnboardingInput) {
    if (!isDatabaseOnline()) {
      throw new AppError(503, "UPSTREAM_UNAVAILABLE", "The onboarding database is unavailable. Final sign-off was not saved.");
    }
    const completedAt = new Date();
    try {
      return await prisma.$transaction(async (tx) => {
        const plan = await tx.onboardingPlan.findUnique({
          where: { id: planId },
          include: { tasks: true },
        });
        if (!plan) throw notFound(`Plan with ID ${planId}`);
        if (!["AWAITING_COMPLETION_APPROVAL", "COMPLETED"].includes(plan.status)) {
          throw conflict(`Final sign-off is not available while the plan is ${plan.status}.`);
        }
        const progress = calculatePlanProgress(plan.tasks.map((task) => ({
          id: task.id,
          taskType: task.taskType,
          status: task.status,
          reviewState: task.reviewState,
          dueDate: task.dueDate.toISOString().slice(0, 10),
        })));
        if (!progress.isComplete) {
          throw conflict("Every onboarding task must be completed or explicitly skipped before final sign-off.");
        }
        const unresolvedReview = plan.tasks.some((task) =>
          ["NEEDS_REVIEW", "ESCALATED", "REJECTED"].includes(task.reviewState),
        );
        if (unresolvedReview) {
          throw conflict("Resolve all task reviews before final sign-off.");
        }
        await tx.onboardingPlan.update({
          where: { id: planId },
          data: { status: "COMPLETED" },
        });
        await tx.employee.update({
          where: { id: plan.employeeId },
          data: { status: "ACTIVE" },
        });
        await tx.auditEvent.create({
          data: {
            actorUserId: input.actorUserId,
            actorRole: input.actorRole,
            action: "onboarding.final_approval",
            resourceType: "OnboardingPlan",
            resourceId: planId,
            reason: input.reason ?? "HR final onboarding sign-off",
            requestId: input.requestId ?? null,
            after: { status: "COMPLETED", completedAt: completedAt.toISOString() },
          },
        });
        return {
          planId,
          status: "COMPLETED" as const,
          completedAt: completedAt.toISOString(),
          completedBy: input.actorName,
        };
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      setDatabaseOnline(false);
      throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Could not save final onboarding sign-off.", { cause: error });
    }
  }

  /**
   * Initializes downstream domain service rows for newly dispatched tasks
   */
  private async initializeDownstreamWorkflow(
    tx: Prisma.TransactionClient,
    task: { id: string; taskType: string; service: string; dueDate: Date },
    employeeId: string,
  ) {
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      select: { jurisdictionCode: true, employmentType: true, roleFamily: true, workMode: true, startDate: true },
    });
    if (!employee) throw notFound("Employee");
    switch (task.service) {
      case "DOCUMENTS":
        await tx.documentRequest.upsert({
          where: { taskId: task.id },
          create: {
            taskId: task.id,
            documentType: task.taskType,
            isRequired: true,
            status: "REQUESTED",
          },
          update: {},
        });
        break;

      case "PAYROLL":
        await tx.payrollSetup.upsert({
          where: { taskId: task.id },
          create: {
            taskId: task.id,
            employeeId,
            status: "PENDING",
          },
          update: {},
        });
        break;

      case "EQUIPMENT": {
        const categoryByType: Record<string, string> = {
          PROVISION_LAPTOP: "laptop",
          PROVISION_PERIPHERALS: "peripheral",
          PROVISION_MOBILE_DEVICE: "mobile",
          ISSUE_ACCESS_BADGE: "access",
        };
        const category = categoryByType[task.taskType] ?? "laptop";
        const catalogItem = await tx.equipmentCatalog.findFirst({
          where: { isActive: true, category },
          orderBy: [{ leadTimeDays: "asc" }, { sku: "asc" }],
        });
        if (!catalogItem) throw conflict(`No active ${category} equipment catalog item is configured.`);
        await tx.equipmentAssignment.upsert({
          where: { taskId: task.id },
          create: { taskId: task.id, catalogId: catalogItem.id, status: "REQUESTED" },
          update: {},
        });
        break;
      }

      case "BENEFITS": {
        if (employee.employmentType === "CONTRACTOR") break;
        const candidates = await tx.benefitPlan.findMany({
          where: { isActive: true, OR: [{ jurisdictionCode: employee.jurisdictionCode }, { jurisdictionCode: null }] },
          orderBy: [{ code: "asc" }],
        });
        const benefitPlan = candidates.find((candidate) => candidate.jurisdictionCode === employee.jurisdictionCode) ?? candidates.find((candidate) => candidate.jurisdictionCode === null);
        if (benefitPlan) {
          const now = new Date(employee.startDate);
          const windowCloses = new Date(
            now.getTime() + benefitPlan.enrollmentWindowDays * 86400000,
          );
          await tx.benefitEnrollment.upsert({
            where: { taskId: task.id },
            create: {
              taskId: task.id,
              benefitPlanId: benefitPlan.id,
              status: "WINDOW_OPEN",
              windowOpensOn: now,
              windowClosesOn: windowCloses,
            },
            update: {},
          });
        } else throw conflict(`No benefits plan is configured for ${employee.jurisdictionCode}.`);
        break;
      }

      case "TRAINING": {
        const courses = await tx.trainingCourse.findMany({
          where: {
            isActive: true,
            OR: [
              { mandatoryForJurisdictions: { has: employee.jurisdictionCode } },
              { mandatoryForJurisdictions: { isEmpty: true } },
              { mandatoryForRoles: { has: employee.roleFamily } },
            ],
          },
          orderBy: [{ code: "asc" }],
        });
        const course = courses.find((item) => item.mandatoryForJurisdictions.includes(employee.jurisdictionCode) || item.mandatoryForRoles.includes(employee.roleFamily)) ?? courses.find((item) => item.mandatoryForJurisdictions.length === 0 && item.mandatoryForRoles.length === 0);
        if (course) {
          await tx.trainingAssignment.upsert({
            where: { taskId: task.id },
            create: {
              taskId: task.id,
              courseId: course.id,
              status: "ASSIGNED",
              dueDate: task.dueDate,
            },
            update: {},
          });
        } else throw conflict(`No eligible training course is configured for ${employee.jurisdictionCode} / ${employee.roleFamily}.`);
        break;
      }

      case "MANAGER": {
        const managerKind: Record<string, string> = {
          ASSIGN_BUDDY: "BUDDY_ASSIGNMENT",
          PREPARE_DAY_ONE_AGENDA: "DAY_ONE_AGENDA",
          SCHEDULE_INTRO_MEETINGS: "INTRO_MEETINGS",
          APPROVE_SYSTEM_ACCESS: "ACCESS_APPROVAL",
          SET_PROBATION_GOALS: "PROBATION_GOALS",
        };
        const kind = managerKind[task.taskType];
        if (!kind) throw badRequest(`Unsupported manager task type: ${task.taskType}`);
        await tx.managerTask.upsert({
          where: { taskId: task.id },
          create: {
            taskId: task.id,
            kind: kind as any,
          },
          update: {},
        });
        break;
      }
    }
  }

  /**
   * Retrieves DAG graph data for visual presentation
   */
  async getPlanGraph(planId: string) {
    let plan: any = null;
    try {
      plan = await prisma.onboardingPlan.findUnique({
        where: { id: planId },
        include: {
          tasks: {
            include: {
              dependencies: true,
            },
          },
        },
      });
    } catch {
      plan = IN_MEMORY_PLANS.get(planId);
    }

    if (!plan) plan = IN_MEMORY_PLANS.get(planId);
    if (!plan) throw notFound(`Plan with ID ${planId}`);

    const taskIds = plan.tasks.map((t: any) => t.id);
    const edges = plan.tasks.flatMap((t: any) =>
      (t.dependencies ?? []).map((d: any) => ({
        from: d.dependsOnId,
        to: d.taskId,
      })),
    );

    const { validateDAG, calculateDepths, calculateCriticalPath } =
      await import("./dependencyEngine.js");
    const dagResult = validateDAG(taskIds, edges);
    const depths = calculateDepths(dagResult.topologicalOrder, edges);
    const cp = calculateCriticalPath(
      plan.tasks.map((t: any) => ({
        id: t.id,
        taskType: t.taskType,
        title: t.title,
        dueDate:
          t.dueDate instanceof Date
            ? t.dueDate.toISOString().slice(0, 10)
            : String(t.dueDate).slice(0, 10),
        earliestStartDate:
          t.earliestStartDate instanceof Date
            ? t.earliestStartDate.toISOString().slice(0, 10)
            : String(t.earliestStartDate).slice(0, 10),
      })),
      edges,
      dagResult.topologicalOrder,
    );

    const criticalSet = new Set(cp.criticalPath);

    return {
      planId,
      nodes: plan.tasks.map((t: any) => ({
        id: t.id,
        taskType: t.taskType,
        title: t.title,
        service: t.service,
        ownerRole: t.ownerRole,
        status: t.status,
        dueDate:
          t.dueDate instanceof Date
            ? t.dueDate.toISOString().slice(0, 10)
            : String(t.dueDate).slice(0, 10),
        earliestStartDate:
          t.earliestStartDate instanceof Date
            ? t.earliestStartDate.toISOString().slice(0, 10)
            : String(t.earliestStartDate).slice(0, 10),
        isAtRisk: t.isAtRisk,
        onCriticalPath: criticalSet.has(t.id),
        depth: depths.get(t.id) ?? 0,
      })),
      edges: edges.map((e: any) => ({
        from: e.from,
        to: e.to,
        onCriticalPath: cp.criticalEdgeSet.has(`${e.from}->${e.to}`),
      })),
      topologicalOrder: dagResult.topologicalOrder,
      criticalPath: cp.criticalPath,
      criticalPathLengthDays: cp.pathLengthDays,
      isAcyclic: true as const,
    };
  }

  /**
   * Returns risks and day-one readiness analysis
   */
  async getPlanRisks(planId: string) {
    let plan: any = null;
    try {
      plan = await prisma.onboardingPlan.findUnique({
        where: { id: planId },
        include: {
          employee: true,
          tasks: true,
        },
      });
    } catch {
      plan = IN_MEMORY_PLANS.get(planId);
    }

    if (!plan) plan = IN_MEMORY_PLANS.get(planId);
    if (!plan) throw notFound(`Plan with ID ${planId}`);

    const progress = calculatePlanProgress(
      plan.tasks.map((t: any) => ({
        id: t.id,
        taskType: t.taskType,
        status: t.status,
        isAtRisk: t.isAtRisk,
        dueDate:
          t.dueDate instanceof Date
            ? t.dueDate.toISOString().slice(0, 10)
            : String(t.dueDate).slice(0, 10),
      })),
      plan.employee.startDate instanceof Date
        ? plan.employee.startDate.toISOString().slice(0, 10)
        : String(plan.employee.startDate).slice(0, 10),
    );

    const risks = plan.tasks
      .filter((t: any) => t.isAtRisk)
      .map((t: any) => {
        let reasonCode:
          | "LEAD_TIME_EXCEEDS_RUNWAY"
          | "DEADLINE_BEFORE_DEPENDENCY"
          | "STATUTORY_DEADLINE_AT_RISK" = "STATUTORY_DEADLINE_AT_RISK";

        if (t.riskReason?.includes("Lead time")) {
          reasonCode = "LEAD_TIME_EXCEEDS_RUNWAY";
        }

        return {
          taskId: t.id,
          taskTitle: t.title,
          service: t.service,
          severity: "HIGH" as const,
          reasonCode,
          message: t.riskReason ?? "Task deadline is at risk.",
          dueDate: t.dueDate.toISOString().slice(0, 10),
          slackDays: -1,
        };
      });

    return {
      planId,
      dayOneReady: progress.dayOneReady,
      risks,
    };
  }

  /**
   * Updates task status, reviewState, or assignment, and automatically unlocks downstream tasks
   */
  async updateTask(
    planId: string,
    taskId: string,
    updates: {
      status?: string;
      reviewState?: string;
      dueDate?: string;
      ownerRole?: string;
      assigneeUserId?: string | null;
      description?: string;
      reason?: string;
    },
    actor: { userId: string; role: string },
  ) {
    if (!isDatabaseOnline()) throw databaseUnavailableError();
    let task: any = null;
    try {
      task = await prisma.planTask.findFirst({
        where: { id: taskId, planId },
        include: {
          plan: {
            include: {
              tasks: {
                include: { dependencies: true },
              },
            },
          },
        },
      });
    } catch (error) {
      throw databaseUnavailableError(error);
    }

    if (!task)
      throw notFound(`Task with ID ${taskId} on plan ${planId}`);

    const currentTask = task;
    if (task && task.planId !== planId) throw notFound("Task on plan");
    if (task && ["AWAITING_COMPLETION_APPROVAL", "COMPLETED"].includes(task.plan.status)) {
      throw conflict("Tasks are locked after all work is complete and awaiting final HR sign-off.");
    }
    if (updates.status === "COMPLETED" && task) {
      if (!["APPROVED", "IN_PROGRESS"].includes(task.plan.status))
        throw conflict("Plan must be approved before completion.");
      const dependencies =
        task.plan.tasks.find((t: any) => t.id === taskId)?.dependencies ?? [];
      if (
        dependencies.some(
          (d: any) =>
            !["COMPLETED", "SKIPPED"].includes(
              task.plan.tasks.find((t: any) => t.id === d.dependsOnId)?.status,
            ),
        )
      )
        throw conflict("Prerequisite tasks are incomplete.");
    }

    const before = {
      status: currentTask.status,
      reviewState: currentTask.reviewState,
      dueDate: currentTask.dueDate.toISOString().slice(0, 10),
      ownerRole: currentTask.ownerRole,
    };

    const isCompleting =
      updates.status === "COMPLETED" && currentTask.status !== "COMPLETED";

    let updated = currentTask;
    try {
        updated = await prisma.$transaction(async (tx) => {
          const result = await tx.planTask.update({
            where: { id: taskId },
            data: {
              ...(updates.status ? { status: updates.status as any } : {}),
              ...(updates.reviewState
                ? { reviewState: updates.reviewState as any }
                : {}),
              ...(updates.ownerRole
                ? { ownerRole: updates.ownerRole as any }
                : {}),
              ...(updates.assigneeUserId !== undefined
                ? { assigneeUserId: updates.assigneeUserId }
                : {}),
              ...(updates.description
                ? { description: updates.description }
                : {}),
              ...(updates.dueDate
                ? { dueDate: new Date(updates.dueDate) }
                : {}),
              ...(isCompleting
                ? { completedAt: new Date(), completedById: actor.userId }
                : {}),
            },
          });

          // Write audit
          await tx.auditEvent.create({
            data: {
              actorUserId: actor.userId,
              actorRole: actor.role,
              action: "task.updated",
              resourceType: "PlanTask",
              resourceId: taskId,
              before,
              after: updates,
              reason: updates.reason ?? "Task updated by user",
            },
          });

          // If task completed, evaluate downstream dependents and unlock them if all prereqs done
          if (isCompleting && task) {
            const allTasks = task.plan.tasks;
            const statusMap: Map<string, string> = new Map(
              allTasks.map((t: any) => [
                t.id,
                t.id === taskId ? "COMPLETED" : t.status,
              ]),
            );
            const deps = allTasks.flatMap((t: any) =>
              (t.dependencies ?? []).map((d: any) => ({
                taskId: d.taskId,
                dependsOnId: d.dependsOnId,
              })),
            );

            // Find tasks that depend on this task
            const dependentTaskIds = deps
              .filter((d: any) => d.dependsOnId === taskId)
              .map((d: any) => d.taskId);
            for (const depId of dependentTaskIds) {
              if (isTaskReadyForDispatch(depId, deps, statusMap)) {
                const depTask = allTasks.find((t: any) => t.id === depId);
                if (depTask && depTask.status === "BLOCKED") {
                  await tx.planTask.update({
                    where: { id: depId },
                    data: { status: "NOT_STARTED" },
                  });
                }
              }
            }

            // Recalculate overall plan progress and status
            const progress = calculatePlanProgress(
              allTasks.map((t: any) => ({
                id: t.id,
                taskType: t.taskType,
                status: t.id === taskId ? "COMPLETED" : t.status,
                dueDate: t.dueDate.toISOString().slice(0, 10),
              })),
            );

            const newStatus = derivePlanStatus(task.plan.status, progress);
            if (newStatus !== task.plan.status) {
              await tx.onboardingPlan.update({
                where: { id: planId },
                data: { status: newStatus as any },
              });
            }
          }

          return result;
        });
    } catch (error) {
      throw databaseUnavailableError(error);
    }

    return updated;
  }
}

export const orchestrator = new OnboardingOrchestrator();
