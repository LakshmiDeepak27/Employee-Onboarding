
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { TrainingAgentState } from './state.js';

import {
  loadTrainingContextNode,
  recommendTrainingCoursesNode,
  validateTrainingRecommendationsNode,
} from './nodes.js';

const TrainingGraphState = Annotation.Root({
  employeeId: Annotation<string>(),
  planId: Annotation<string>(),
  planStatus: Annotation<string | null>(),
  employee: Annotation<TrainingAgentState['employee']>(),
  trainingTasks: Annotation<TrainingAgentState['trainingTasks']>(),
  availableCourses: Annotation<TrainingAgentState['availableCourses']>(),
  recommendations: Annotation<TrainingAgentState['recommendations']>(),
  validatedRecommendations: Annotation<
    TrainingAgentState['validatedRecommendations']
  >(),
  assignmentsCreated: Annotation<string[]>(),
errors: Annotation<string[]>(),
warnings: Annotation<string[]>(),
statutoryFindings: Annotation<string[]>(),
  requiresHumanReview: Annotation<boolean>(),
  reviewReason: Annotation<string | null>(),
  executionStatus: Annotation<TrainingAgentState['executionStatus']>(),
});

export function createTrainingAgentGraph() {
  return new StateGraph(TrainingGraphState)
    .addNode('load_context', async (state) =>
      loadTrainingContextNode(state as TrainingAgentState),
    )
    .addNode('recommend', async (state) =>
      recommendTrainingCoursesNode(state as TrainingAgentState),
    )
    .addNode('validate', async (state) =>
      validateTrainingRecommendationsNode(state as TrainingAgentState),
    )
    .addEdge(START, 'load_context')
    .addConditionalEdges(
      'load_context',
      (state) => {
        const current = state as TrainingAgentState;

        return current.executionStatus === 'RECOMMENDING' &&
          current.employee &&
          current.trainingTasks.length > 0
          ? 'recommend'
          : END;
      },
    )
    .addConditionalEdges(
      'recommend',
      (state) => {
        const current = state as TrainingAgentState;

        return current.executionStatus === 'VALIDATING'
          ? 'validate'
          : END;
      },
    )
    .addEdge('validate', END)
    .compile();
}

export function createInitialTrainingState(
  employeeId: string,
  planId: string,
): TrainingAgentState {
  return {
    employeeId,
    planId,
    planStatus: null,
    employee: null,
    trainingTasks: [],
    availableCourses: [],
    recommendations: [],
    validatedRecommendations: [],
    assignmentsCreated: [],
    errors: [],
    warnings: [],
    statutoryFindings: [],
    requiresHumanReview: false,
    reviewReason: null,
    executionStatus: 'PENDING',
  };
}
