
import {
  ManagingAgentOutputSchema,
  type ManagingAgentOutput,
  type ManagingEmployeeContext,
  type ExistingManagerTaskContext,
  type ManagerActionRecommendation,
  MANAGER_ACTION_TYPES,
} from './state.js';

const VALID_ACTION_TYPES = new Set<string>(MANAGER_ACTION_TYPES);

function mergeReviewReasons(
  initialReason: string | null,
  additionalReasons: string[],
): string | null {
  const uniqueReasons = [...new Set(
    additionalReasons.map((reason) => reason.trim()).filter(Boolean),
  )];

  const combined = [
    initialReason?.trim(),
    ...uniqueReasons,
  ].filter((reason): reason is string => Boolean(reason));

  return [...new Set(combined)].join(' ').slice(0, 1000) || null;
}

/**
 * Validates Managing Agent output before it is returned
 * to the orchestration workflow.
 *
 * This function does not create, assign, approve, or dispatch tasks.
 */
export function validateManagingAgentOutput(
  rawOutput: unknown,
  employee: ManagingEmployeeContext,
  existingTasks: ExistingManagerTaskContext[],
): ManagingAgentOutput {
  const parsed = ManagingAgentOutputSchema.safeParse(rawOutput);

  if (!parsed.success) {
    return {
      recommendations: [],
      requiresHumanReview: true,
      reviewReason:
        'The Managing Agent returned invalid structured output. Manual review is required.',
    };
  }

  const output = parsed.data;
  const reviewReasons: string[] = [];

  let requiresHumanReview = output.requiresHumanReview;

  // Validate manager ownership.
  if (!employee.managerId) {
    requiresHumanReview = true;
    reviewReasons.push(
      'No manager is assigned to this employee. Manager ownership must be resolved.',
    );
  }

  // Validate department assignment.
  if (!employee.departmentId) {
    requiresHumanReview = true;
    reviewReasons.push(
      'Department assignment is missing. The employee department must be confirmed before access requirements can be finalized.',
    );
  }

  const existingTaskTypes = new Set(
    existingTasks.map((task) => task.taskType),
  );

  const seenTaskTypes = new Set<string>();

  const recommendations: ManagerActionRecommendation[] = [];

  for (const recommendation of output.recommendations) {
    if (!VALID_ACTION_TYPES.has(recommendation.taskType)) {
      requiresHumanReview = true;
      reviewReasons.push(
        `Unsupported manager action type: ${recommendation.taskType}.`,
      );
      continue;
    }

    // Avoid recommending actions already present in the plan.
    if (existingTaskTypes.has(recommendation.taskType)) {
      continue;
    }

    // Avoid duplicate recommendations.
    if (seenTaskTypes.has(recommendation.taskType)) {
      requiresHumanReview = true;
      reviewReasons.push(
        `Duplicate recommendation detected: ${recommendation.taskType}.`,
      );
      continue;
    }

    seenTaskTypes.add(recommendation.taskType);

    const blockers = [...recommendation.blockers];

    let recommendationNeedsReview =
      recommendation.requiresHumanReview;

    if (!employee.managerId) {
      blockers.push(
        'A manager must be assigned before this action can proceed.',
      );
      recommendationNeedsReview = true;
    }

    if (!employee.departmentId &&
        recommendation.taskType === 'APPROVE_SYSTEM_ACCESS') {
      blockers.push(
        'Department assignment is required before system access can be finalized.',
      );
      recommendationNeedsReview = true;
    }

    if (
      recommendation.dependencies.includes(
        recommendation.taskType,
      )
    ) {
      blockers.push('An action cannot depend on itself.');
      recommendationNeedsReview = true;
    }

    for (const dependency of recommendation.dependencies) {
      const dependencyExists =
        existingTaskTypes.has(dependency) ||
        output.recommendations.some(
          (candidate) => candidate.taskType === dependency,
        );

      if (!dependencyExists) {
        blockers.push(
          `Dependency ${dependency} is neither an existing task nor a proposed action.`,
        );
        recommendationNeedsReview = true;
      }
    }

    if (recommendationNeedsReview) {
      requiresHumanReview = true;
    }

    recommendations.push({
      ...recommendation,
      blockers: [...new Set(blockers)],
      requiresHumanReview: recommendationNeedsReview,
    });
  }

  return {
    recommendations,
    requiresHumanReview,
    reviewReason: mergeReviewReasons(
      output.reviewReason,
      reviewReasons,
    ),
  };
}
