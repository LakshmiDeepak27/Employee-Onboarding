
// import { ChatOllama } from '@langchain/ollama';
import { ChatGoogle } from '@langchain/google';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

import { env } from '../../config/env.js';
import {
  loadActiveTrainingCourses,
  loadTrainingPlanContext,
  loadTrainingTasks,
} from './tools.js';

import {
  TRAINING_SYSTEM_PROMPT,
  buildTrainingRecommendationPrompt,
} from './prompts.js';

import { validateTrainingRecommendations } from './validation.js';

import { TrainingRecommendationSchema } from './state.js';

import type { TrainingAgentState } from './state.js';

/**
 * Node 1: Load trusted employee, plan, task and course context.
 */
export async function loadTrainingContextNode(
  state: TrainingAgentState,
): Promise<Partial<TrainingAgentState>> {
  try {
    const { planStatus, employee } = await loadTrainingPlanContext(
      state.employeeId,
      state.planId,
    );

    const [trainingTasks, availableCourses] = await Promise.all([
      loadTrainingTasks(state.planId),
      loadActiveTrainingCourses(),
    ]);

    if (trainingTasks.length === 0) {
      return {
        planStatus,
        employee,
        trainingTasks,
        availableCourses,
        executionStatus: 'COMPLETED',
        warnings: [...state.warnings, 'No training tasks found in this plan.'],
      };
    }

    if (availableCourses.length === 0) {
      return {
        planStatus,
        employee,
        trainingTasks,
        availableCourses,
        executionStatus: 'NEEDS_REVIEW',
        requiresHumanReview: true,
        reviewReason: 'No active training courses are available.',
      };
    }

    return {
      planStatus,
      employee,
      trainingTasks,
      availableCourses,
      executionStatus: 'RECOMMENDING',
    };
  } catch (error) {
    return {
      executionStatus: 'FAILED',
      errors: [
        ...state.errors,
        error instanceof Error ? error.message : 'Failed to load training context.',
      ],
    };
  }
}

/**
 * Node 2: Ask the LLM to recommend courses from trusted context.
 */
export async function recommendTrainingCoursesNode(
  state: TrainingAgentState,
): Promise<Partial<TrainingAgentState>> {
  if (!state.employee || state.trainingTasks.length === 0) {
    return {
      executionStatus: 'FAILED',
      errors: [...state.errors, 'Missing employee context or training tasks.'],
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
  throw new Error('GOOGLE_API_KEY is missing from the environment.');
}

const model = new ChatGoogle({
  apiKey,
  model: env.GEMINI_MODEL,
  temperature: 0,
});
    const structuredModel = model.withStructuredOutput(
      TrainingRecommendationSchema,
    );

    const prompt = buildTrainingRecommendationPrompt({
      employee: state.employee,
      tasks: state.trainingTasks,
      courses: state.availableCourses,
    });

    const result = await structuredModel.invoke([
      new SystemMessage(TRAINING_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const parsed = TrainingRecommendationSchema.parse(result);

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
  reviewReason: 'The training recommendation model failed. Deterministic validation will continue without LLM recommendations.',
  recommendations: [],
  errors: [
    ...state.errors,
    error instanceof Error ? error.message : 'LLM recommendation failed.',
  ],
};
  }
}

/**
 * Node 3: Independently validate every model recommendation
 * and check jurisdiction-specific statutory requirements.
 */
export async function validateTrainingRecommendationsNode(
  state: TrainingAgentState,
): Promise<Partial<TrainingAgentState>> {
  if (!state.employee) {
    return {
      executionStatus: 'FAILED',
      errors: [
        ...state.errors,
        'Employee context is unavailable for validation.',
      ],
    };
  }

  const result = validateTrainingRecommendations({
    employee: state.employee,
    tasks: state.trainingTasks,
    courses: state.availableCourses,
    recommendations: state.recommendations,
  });

  const statutoryFindings = result.statutoryFindings;

  const requiresHumanReview =
    state.requiresHumanReview || result.requiresHumanReview;

  const reviewReasons = [
    state.reviewReason,
    result.requiresHumanReview
      ? 'One or more training recommendations failed deterministic validation.'
      : null,
    ...statutoryFindings,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    validatedRecommendations: result.validRecommendations,
    errors: [...state.errors, ...result.errors],
    warnings: [...state.warnings, ...result.warnings],
    statutoryFindings,
    requiresHumanReview,
    reviewReason:
      reviewReasons.length > 0
        ? [...new Set(reviewReasons)].join(' ')
        : null,
    executionStatus: requiresHumanReview ? 'NEEDS_REVIEW' : 'COMPLETED',
  };
}