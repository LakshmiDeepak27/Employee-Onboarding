
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type { ManagingAgentState } from './state.js';

import {
  loadManagingContextNode,
  planManagerActionsNode,
  validateManagerActionsNode,
} from './nodes.js';

const ManagingGraphState = Annotation.Root({
  employeeId: Annotation<string>(),
  planId: Annotation<string>(),
  planStatus: Annotation<string | null>(),
  employee: Annotation<ManagingAgentState['employee']>(),
  managerTasks: Annotation<ManagingAgentState['managerTasks']>(),
  recommendations: Annotation<ManagingAgentState['recommendations']>(),
  errors: Annotation<string[]>(),
  warnings: Annotation<string[]>(),
  blockers: Annotation<string[]>(),
  requiresHumanReview: Annotation<boolean>(),
  reviewReason: Annotation<string | null>(),
  executionStatus: Annotation<ManagingAgentState['executionStatus']>(),
});

export function createManagingAgentGraph() {
  return new StateGraph(ManagingGraphState)
    .addNode('load_context', async (state) =>
      loadManagingContextNode(state as ManagingAgentState),
    )
    .addNode('plan_actions', async (state) =>
      planManagerActionsNode(state as ManagingAgentState),
    )
    .addNode('validate', async (state) =>
      validateManagerActionsNode(state as ManagingAgentState),
    )
    .addEdge(START, 'load_context')
    .addConditionalEdges(
      'load_context',
      (state) => {
        const current = state as ManagingAgentState;

        return current.executionStatus === 'ANALYZING' &&
          current.employee
          ? 'plan_actions'
          : END;
      },
    )
    .addConditionalEdges(
      'plan_actions',
      (state) => {
        const current = state as ManagingAgentState;

        return current.executionStatus === 'VALIDATING'
          ? 'validate'
          : END;
      },
    )
    .addEdge('validate', END)
    .compile();
}

export function createInitialManagingState(
  employeeId: string,
  planId: string,
): ManagingAgentState {
  return {
    employeeId,
    planId,
    planStatus: null,
    employee: null,
    managerTasks: [],
    recommendations: [],
    errors: [],
    warnings: [],
    blockers: [],
    requiresHumanReview: false,
    reviewReason: null,
    executionStatus: 'PENDING',
  };
}
