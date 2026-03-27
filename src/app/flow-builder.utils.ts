import {
  DecisionNode,
  FlowDefinition,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  ValidationIssue
} from './flow-builder.models';

export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 156;

export function buildEdgePath(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): string {
  const horizontalDistance = Math.abs(endX - startX);
  const controlOffset = Math.max(32, Math.min(140, horizontalDistance / 2));

  return `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${
    endX - controlOffset
  } ${endY}, ${endX} ${endY}`;
}

export function getNodeTitle(nodeType: FlowNodeType): string {
  switch (nodeType) {
    case 'start':
      return 'Start';
    case 'collect-variable':
      return 'Collect Variable';
    case 'decision':
      return 'Decision';
    case 'route-to-queue':
      return 'Route to Queue';
  }
}

export function findNode(flow: FlowDefinition, nodeId: string): FlowNode | undefined {
  return flow.nodes.find((node) => node.id === nodeId);
}

export function findOutgoingEdge(flow: FlowDefinition, nodeId: string): FlowEdge | undefined {
  return flow.edges.find((edge) => edge.sourceNodeId === nodeId);
}

export function findOutgoingEdges(flow: FlowDefinition, nodeId: string): FlowEdge[] {
  return flow.edges.filter((edge) => edge.sourceNodeId === nodeId);
}

export function findOutgoingEdgeForExit(
  flow: FlowDefinition,
  nodeId: string,
  exitId: string
): FlowEdge | undefined {
  return flow.edges.find(
    (edge) => edge.sourceNodeId === nodeId && edge.sourceExitId === exitId
  );
}

export function findIncomingEdge(flow: FlowDefinition, nodeId: string): FlowEdge | undefined {
  return flow.edges.find((edge) => edge.targetNodeId === nodeId);
}

export function groupIssuesByNode(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of issues) {
    if (!issue.nodeId) {
      continue;
    }

    const existing = grouped.get(issue.nodeId) ?? [];
    existing.push(issue);
    grouped.set(issue.nodeId, existing);
  }

  return grouped;
}

export function wouldCreateCycle(
  flow: FlowDefinition,
  sourceNodeId: string,
  targetNodeId: string
): boolean {
  const adjacency = new Map<string, string[]>();

  for (const edge of flow.edges) {
    const neighbors = adjacency.get(edge.sourceNodeId) ?? [];
    neighbors.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, neighbors);
  }

  const newNeighbors = adjacency.get(sourceNodeId) ?? [];
  newNeighbors.push(targetNodeId);
  adjacency.set(sourceNodeId, newNeighbors);

  const visited = new Set<string>();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === sourceNodeId) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const nextNodeId of adjacency.get(current) ?? []) {
      queue.push(nextNodeId);
    }
  }

  return false;
}

export function validateFlow(flow: FlowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const startNodes = flow.nodes.filter((node) => node.type === 'start');
  const routeNodes = flow.nodes.filter((node) => node.type === 'route-to-queue');

  if (startNodes.length === 0) {
    issues.push({
      code: 'missing-start',
      message: 'Add a start node to define where the chat sequence begins.'
    });
  }

  if (startNodes.length > 1) {
    for (const node of startNodes.slice(1)) {
      issues.push({
        code: 'extra-start',
        message: 'Only one start node is allowed in this flow.',
        nodeId: node.id
      });
    }
  }

  if (routeNodes.length === 0) {
    issues.push({
      code: 'missing-route',
      message: 'Add a route-to-queue node so the flow ends in a destination queue.'
    });
  }

  const variableKeyOwners = new Map<string, string[]>();

  for (const node of flow.nodes) {
    if (node.type === 'collect-variable') {
      const variableKey = node.config.variableKey.trim();
      const prompt = node.config.prompt.trim();

      if (!variableKey) {
        issues.push({
          code: 'missing-variable-key',
          message: 'Variable key is required.',
          nodeId: node.id
        });
      } else {
        const owners = variableKeyOwners.get(variableKey) ?? [];
        owners.push(node.id);
        variableKeyOwners.set(variableKey, owners);
      }

      if (!prompt) {
        issues.push({
          code: 'missing-prompt',
          message: 'Prompt is required so the AI knows what to ask for.',
          nodeId: node.id
        });
      }
    }

    if (node.type === 'decision') {
      validateDecisionNode(flow, node, issues);
    }

    if (node.type === 'route-to-queue' && (!node.config.queueId || !node.config.queueName)) {
      issues.push({
        code: 'missing-queue',
        message: 'Select a queue destination for this route node.',
        nodeId: node.id
      });
    }
  }

  for (const owners of variableKeyOwners.values()) {
    if (owners.length < 2) {
      continue;
    }

    for (const nodeId of owners) {
      issues.push({
        code: 'duplicate-variable-key',
        message: 'Variable keys must be unique across the flow.',
        nodeId
      });
    }
  }

  if (startNodes.length === 1) {
    const reachableNodeIds = getReachableNodeIds(flow, startNodes[0].id);

    for (const node of flow.nodes) {
      if (!reachableNodeIds.has(node.id)) {
        issues.push({
          code: 'disconnected-node',
          message: 'This node is disconnected from the main chat path.',
          nodeId: node.id
        });
      }
    }
  }

  return issues;
}

function validateDecisionNode(
  flow: FlowDefinition,
  node: DecisionNode,
  issues: ValidationIssue[]
): void {
  const prompt = node.config.intentPrompt.trim();

  if (!prompt) {
    issues.push({
      code: 'missing-decision-prompt',
      message: 'Decision nodes need a prompt describing what the user wants.',
      nodeId: node.id
    });
  }

  if (node.config.exits.length < 2) {
    issues.push({
      code: 'too-few-decision-exits',
      message: 'Decision nodes need at least two exits.',
      nodeId: node.id
    });
  }

  const exitLabelOwners = new Map<string, string[]>();

  for (const exit of node.config.exits) {
    const label = exit.label.trim();

    if (!label) {
      issues.push({
        code: 'missing-decision-exit-label',
        message: 'Every decision exit needs a label.',
        nodeId: node.id
      });
    } else {
      const owners = exitLabelOwners.get(label) ?? [];
      owners.push(exit.id);
      exitLabelOwners.set(label, owners);
    }

    if (!findOutgoingEdgeForExit(flow, node.id, exit.id)) {
      issues.push({
        code: 'unconnected-decision-exit',
        message: `Connect the "${label || 'unnamed'}" exit to a next step.`,
        nodeId: node.id
      });
    }
  }

  for (const owners of exitLabelOwners.values()) {
    if (owners.length < 2) {
      continue;
    }

    issues.push({
      code: 'duplicate-decision-exit-label',
      message: 'Decision exit labels must be unique within the node.',
      nodeId: node.id
    });
  }
}

function getReachableNodeIds(flow: FlowDefinition, startNodeId: string): Set<string> {
  const reachable = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (reachable.has(current)) {
      continue;
    }

    reachable.add(current);

    for (const edge of flow.edges) {
      if (edge.sourceNodeId === current) {
        queue.push(edge.targetNodeId);
      }
    }
  }

  return reachable;
}
