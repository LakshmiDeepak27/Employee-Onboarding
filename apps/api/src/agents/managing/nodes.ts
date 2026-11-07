
import { ChatGoogle } from '@langchain/google';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

import { env } from '../../config/env.js';

import {
  loadManagingPlanContext,
  loadExistingManagerTasks,
} from './tools.js';

import {
  MANAGING_AGENT_SYSTEM_PROMPT,
  MANAGING_AGENT_USER_PROMPT,
} from './prompts.js';

import { validateManagingAgentOutput } from './validation.js';

import {
  ManagingAgentOutputSchema,
  type ManagingAgentState,
} from './state.js';

/**
 * Node 1: Load trusted employee, plan and existing manager-task context.
 */
export async function loadManagingContextNode(
  state: ManagingAgentState,
): Promise<Partial<ManagingAgentState>> {
  try {
    const { planStatus, employee } = await loadManagingPlanContext(
      state.employeeId,
      state.planId,
    );

    const managerTasks = await loadExistingManagerTasks(state.planId);

    const blockers = [...state.blockers];

    if (!employee.managerId) {
  blockers.push(
    'No manager is currently assigned to this employee.',
  );
}

if (!employee.departmentId) {
  blockers.push(
    'Department assignment is missing.',
  );
}
    return {
      planStatus,
      employee,
      managerTasks,
      blockers: [...new Set(blockers)],
      executionStatus: 'ANALYZING',
    };
  } catch (error) {
    return {
      executionStatus: 'FAILED',
      errors: [
        ...state.errors,
        error instanceof Error
          ? error.message
          : 'Failed to load managing context.',
      ],
    };
  }
}

/**
 * Node 2: Ask Gemini to create a prioritized manager action plan.
 *
 * The LLM proposes actions only. It cannot execute or dispatch them.
 */
export async function planManagerActionsNode(
  state: ManagingAgentState,
): Promise<Partial<ManagingAgentState>> {
  if (!state.employee) {
    return {
      executionStatus: 'FAILED',
      errors: [
        ...state.errors,
        'Employee context is unavailable for manager action planning.',
      ],
    };
  }

  try {
    // const model = new ChatOllama({
    //   baseUrl: env.OLLAMA_BASE_URL,
    //   model: env.LLM_MODEL,
    //   temperature: 0,
    // });
    const apiKey = env.GOOGLE_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY is missing from the environment.',
      );
    }

    const model = new ChatGoogle({
      apiKey,
      model: env.GEMINI_MODEL,
      temperature: 0,
    });

    const structuredModel = model.withStructuredOutput(
      ManagingAgentOutputSchema,
    );

    const prompt = MANAGING_AGENT_USER_PROMPT
      .replace(
        '{employeeContext}',
        JSON.stringify(state.employee, null, 2),
      )
      .replace(
        '{existingManagerTasks}',
        JSON.stringify(state.managerTasks, null, 2),
      )
      .replace(
        '{blockers}',
        JSON.stringify(state.blockers, null, 2),
      );

    const result = await structuredModel.invoke([
      new SystemMessage(MANAGING_AGENT_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const parsed = ManagingAgentOutputSchema.parse(result);

    return {
      recommendations: parsed.recommendations,
      requiresHumanReview: parsed.requiresHumanReview,
      reviewReason: parsed.reviewReason,
      executionStatus: 'VALIDATING',
    };
  } catch (error) {
    return {
      executionStatus: 'VALIDATING',
      requiresHumanReview: true,
      reviewReason:
        'The Managing Agent model failed. Deterministic validation will continue without LLM recommendations.',
      recommendations: [],
      errors: [
        ...state.errors,
        error instanceof Error
          ? error.message
          : 'Manager action planning failed.',
      ],
    };
  }
}

/**
 * Node 3: Independently validate recommendations.
 *
 * Invalid or uncertain recommendations are flagged for human review.
 */
export async function validateManagerActionsNode(
  state: ManagingAgentState,
): Promise<Partial<ManagingAgentState>> {
  if (!state.employee) {
    return {
      executionStatus: 'FAILED',
      errors: [
        ...state.errors,
        'Employee context is unavailable for validation.',
      ],
      requiresHumanReview: true,
      reviewReason:
        'Manager action recommendations cannot be validated without employee context.',
    };
  }

  const result = validateManagingAgentOutput(
    {
      recommendations: state.recommendations,
      requiresHumanReview: state.requiresHumanReview,
      reviewReason: state.reviewReason,
    },
    state.employee,
    state.managerTasks,
  );

  const requiresHumanReview = result.requiresHumanReview;

  return {
    recommendations: result.recommendations,
    blockers: [
      ...new Set([
        ...state.blockers,
        ...result.recommendations.flatMap(
          (recommendation) => recommendation.blockers,
        ),
      ]),
    ],
    errors: state.errors,
    warnings: state.warnings,
    requiresHumanReview,
    reviewReason: result.reviewReason,
    executionStatus: requiresHumanReview
      ? 'NEEDS_REVIEW'
      : 'COMPLETED',
  };
}
