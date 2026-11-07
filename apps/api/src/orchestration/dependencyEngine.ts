/**
 * DETERMINISTIC DAG DEPENDENCY ENGINE
 *
 * Core responsibilities:
 * 1. Graph representation of task dependencies (Directed Acyclic Graph).
 * 2. Cycle detection (guardrail V5: fails with CYCLE_DETECTED if loop exists).
 * 3. Topological sorting (Kahn's algorithm).
 * 4. Critical path calculation (longest path from entry to terminal tasks).
 * 5. Layered depth calculation for UI graph rendering.
 * 6. Earliest start date propagation based on prerequisite deadlines.
 * 7. Dispatch eligibility checking (all required dependencies completed).
 */

export interface DAGTaskNode {
  id: string;
  taskType: string;
  title: string;
  service?: string;
  ownerRole?: string;
  status?: string;
  dueDate: string; // YYYY-MM-DD
  earliestStartDate: string; // YYYY-MM-DD
  isAtRisk?: boolean;
  depth?: number;
  onCriticalPath?: boolean;
}

export interface DAGEdge {
  from: string; // Prerequisite task id (must finish first)
  to: string; // Dependent task id
  onCriticalPath?: boolean;
}

export interface GraphValidationResult {
  isAcyclic: boolean;
  cycle?: string[]; // Task IDs in the detected cycle
  topologicalOrder: string[];
}

export interface PlanGraphOutput {
  planId: string;
  nodes: {
    id: string;
    taskType: any;
    title: string;
    service: any;
    ownerRole: any;
    status: any;
    dueDate: string;
    earliestStartDate: string;
    isAtRisk: boolean;
    onCriticalPath: boolean;
    depth: number;
  }[];
  edges: {
    from: string;
    to: string;
    onCriticalPath: boolean;
  }[];
  topologicalOrder: string[];
  criticalPath: string[];
  criticalPathLengthDays: number;
  isAcyclic: true;
}

/**
 * Validates DAG and computes topological ordering.
 * Uses Kahn's algorithm with in-degree tracking for cycle detection.
 */
export function validateDAG(
  taskIds: string[],
  edges: { from: string; to: string }[],
): GraphValidationResult {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of taskIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.to) && adjacency.has(edge.from)) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      adjacency.get(edge.from)?.push(edge.to);
    }
  }

  // Queue of nodes with no incoming dependencies (roots)
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    topologicalOrder.push(current);

    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) {
        queue.push(next);
      }
    }
  }

  if (topologicalOrder.length !== taskIds.length) {
    // Cycle detected! Find cycle components via DFS for diagnostic reporting
    const cycle = findCycleDFS(taskIds, adjacency);
    return {
      isAcyclic: false,
      cycle,
      topologicalOrder: [],
    };
  }

  return {
    isAcyclic: true,
    topologicalOrder,
  };
}

/** DFS Cycle detector for detailed cycle explanation */
function findCycleDFS(nodes: string[], adj: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string>();
  let cycleNodes: string[] = [];

  function dfs(curr: string): boolean {
    visited.add(curr);
    inStack.add(curr);

    for (const next of adj.get(curr) ?? []) {
      if (!visited.has(next)) {
        parent.set(next, curr);
        if (dfs(next)) return true;
      } else if (inStack.has(next)) {
        // Cycle found
        cycleNodes = [next];
        let p = curr;
        while (p !== next && p) {
          cycleNodes.push(p);
          p = parent.get(p) ?? "";
        }
        cycleNodes.push(next);
        cycleNodes.reverse();
        return true;
      }
    }

    inStack.delete(curr);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node)) {
      if (dfs(node)) break;
    }
  }

  return cycleNodes;
}

/**
 * Calculates visual depth layers (0 = root tasks with no prerequisites)
 */
export function calculateDepths(
  topologicalOrder: string[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const depths = new Map<string, number>();
  const incoming = new Map<string, string[]>();

  for (const id of topologicalOrder) {
    depths.set(id, 0);
    incoming.set(id, []);
  }

  for (const edge of edges) {
    incoming.get(edge.to)?.push(edge.from);
  }

  for (const id of topologicalOrder) {
    const parents = incoming.get(id) ?? [];
    if (parents.length === 0) {
      depths.set(id, 0);
    } else {
      let maxParentDepth = 0;
      for (const p of parents) {
        maxParentDepth = Math.max(maxParentDepth, depths.get(p) ?? 0);
      }
      depths.set(id, maxParentDepth + 1);
    }
  }

  return depths;
}

/**
 * Computes critical path through DAG based on task duration estimates
 */
export function calculateCriticalPath(
  nodes: DAGTaskNode[],
  edges: { from: string; to: string }[],
  topologicalOrder: string[],
): {
  criticalPath: string[];
  pathLengthDays: number;
  criticalEdgeSet: Set<string>;
} {
  const nodeMap = new Map<string, DAGTaskNode>(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const id of topologicalOrder) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }

  for (const edge of edges) {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  // Calculate earliest finish times along the topological order
  // Duration: difference between earliestStartDate and dueDate in days (minimum 1 day)
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();

  for (const id of topologicalOrder) {
    const node = nodeMap.get(id);
    let duration = 1;
    if (node) {
      const dStart = new Date(node.earliestStartDate).getTime();
      const dDue = new Date(node.dueDate).getTime();
      const diff = Math.round((dDue - dStart) / (1000 * 60 * 60 * 24));
      duration = Math.max(1, diff);
    }

    const parents = incoming.get(id) ?? [];
    if (parents.length === 0) {
      dist.set(id, duration);
      prev.set(id, null);
    } else {
      let maxDist = 0;
      let bestParent: string | null = null;
      for (const p of parents) {
        const pDist = dist.get(p) ?? 0;
        if (pDist > maxDist) {
          maxDist = pDist;
          bestParent = p;
        }
      }
      dist.set(id, maxDist + duration);
      prev.set(id, bestParent);
    }
  }

  // Find terminal node with highest distance
  let maxTerminalDist = 0;
  let terminalNode: string | null = null;

  for (const id of topologicalOrder) {
    const curDist = dist.get(id) ?? 0;
    if (curDist >= maxTerminalDist) {
      maxTerminalDist = curDist;
      terminalNode = id;
    }
  }

  const criticalPath: string[] = [];
  let curr = terminalNode;
  while (curr) {
    criticalPath.unshift(curr);
    curr = prev.get(curr) ?? null;
  }

  const criticalEdgeSet = new Set<string>();
  for (let i = 0; i < criticalPath.length - 1; i++) {
    criticalEdgeSet.add(`${criticalPath[i]}->${criticalPath[i + 1]}`);
  }

  return {
    criticalPath,
    pathLengthDays: maxTerminalDist,
    criticalEdgeSet,
  };
}

/**
 * Checks whether a task is ready to be dispatched.
 * A task can only be dispatched if all its prerequisites are COMPLETED.
 */
export function isTaskReadyForDispatch(
  taskId: string,
  dependencies: { taskId: string; dependsOnId: string }[],
  taskStatusMap: Map<string, string>,
): boolean {
  const prerequisites = dependencies
    .filter((d) => d.taskId === taskId)
    .map((d) => d.dependsOnId);

  for (const prereqId of prerequisites) {
    const status = taskStatusMap.get(prereqId);
    if (status !== "COMPLETED" && status !== "SKIPPED") {
      return false;
    }
  }

  return true;
}
