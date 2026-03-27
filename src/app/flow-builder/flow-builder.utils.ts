import {
  AskQuestionNode,
  ConditionNode,
  ConditionOperator,
  DecisionNode,
  FlowDefinition,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  ValidationIssue
} from './flow-builder.models';

export const NODE_WIDTH = 248;
export const NODE_HEIGHT = 156;
export const CONDITION_DEFAULT_PORT_ID = 'condition-default';

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
    case 'send-message':
      return 'Send Message';
    case 'ask-question':
      return 'Ask Question';
    case 'collect-variable':
      return 'Collect Variable';
    case 'decision':
      return 'Decision';
    case 'condition':
      return 'Condition';
    case 'fallback':
      return 'Fallback';
    case 'route-to-queue':
      return 'Route to Queue';
    case 'human-handoff':
      return 'Human Handoff';
    case 'end-conversation':
      return 'End Conversation';
    case 'set-variable':
      return 'Set Variable';
    case 'api-lookup':
      return 'API Lookup';
    case 'knowledge-answer':
      return 'Knowledge Answer';
  }
}

export function findNode(flow: FlowDefinition, nodeId: string): FlowNode | undefined {
  return flow.nodes.find((node) => node.id === nodeId);
}

export function findOutgoingEdge(flow: FlowDefinition, nodeId: string): FlowEdge | undefined {
  return flow.edges.find(
    (edge) => edge.sourceNodeId === nodeId && edge.sourcePortId === undefined
  );
}

export function findOutgoingEdges(flow: FlowDefinition, nodeId: string): FlowEdge[] {
  return flow.edges.filter((edge) => edge.sourceNodeId === nodeId);
}

export function findOutgoingEdgeForPort(
  flow: FlowDefinition,
  nodeId: string,
  portId: string
): FlowEdge | undefined {
  return flow.edges.find(
    (edge) => edge.sourceNodeId === nodeId && edge.sourcePortId === portId
  );
}

export function findIncomingEdge(flow: FlowDefinition, nodeId: string): FlowEdge | undefined {
  return flow.edges.find((edge) => edge.targetNodeId === nodeId);
}

export function findIncomingEdges(flow: FlowDefinition, nodeId: string): FlowEdge[] {
  return flow.edges.filter((edge) => edge.targetNodeId === nodeId);
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
  targetNodeId: string,
  ignoredEdgeId?: string
): boolean {
  const adjacency = new Map<string, string[]>();

  for (const edge of flow.edges) {
    if (ignoredEdgeId && edge.id === ignoredEdgeId) {
      continue;
    }

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

export function allowsMultipleIncoming(node: FlowNode): boolean {
  return (
    node.type === 'fallback' ||
    node.type === 'route-to-queue' ||
    node.type === 'human-handoff' ||
    node.type === 'end-conversation' ||
    node.type === 'knowledge-answer'
  );
}

export function isTerminalNode(node: FlowNode): boolean {
  return (
    node.type === 'route-to-queue' ||
    node.type === 'human-handoff' ||
    node.type === 'end-conversation'
  );
}

export function conditionOperatorRequiresValue(operator: ConditionOperator): boolean {
  return operator !== 'is-empty' && operator !== 'is-not-empty';
}

export function normalizeChoices(choices: string[]): string[] {
  return choices.map((choice) => choice.trim()).filter((choice) => choice.length > 0);
}

export function validateFlow(flow: FlowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const startNodes = flow.nodes.filter((node) => node.type === 'start');
  const terminalNodes = flow.nodes.filter((node) => isTerminalNode(node));

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

  if (terminalNodes.length === 0) {
    issues.push({
      code: 'missing-terminal',
      message: 'Add a route, human handoff, or end node so the flow has a terminal outcome.'
    });
  }

  const variableKeyOwners = new Map<string, string[]>();

  for (const node of flow.nodes) {
    switch (node.type) {
      case 'send-message':
        if (!node.config.message.trim()) {
          issues.push({
            code: 'missing-send-message',
            message: 'Send Message nodes need message copy.',
            nodeId: node.id
          });
        }
        break;
      case 'ask-question':
        validateAskQuestionNode(node, issues);
        break;
      case 'collect-variable':
        validateCollectNode(node, variableKeyOwners, issues);
        break;
      case 'decision':
        validateDecisionNode(flow, node, issues);
        break;
      case 'condition':
        validateConditionNode(flow, node, issues);
        break;
      case 'fallback':
        if (!node.config.message.trim()) {
          issues.push({
            code: 'missing-fallback-message',
            message: 'Fallback nodes need copy for the uncertain or no-match case.',
            nodeId: node.id
          });
        }
        break;
      case 'route-to-queue':
        if (!node.config.queueId || !node.config.queueName) {
          issues.push({
            code: 'missing-queue',
            message: 'Select a queue destination for this route node.',
            nodeId: node.id
          });
        }
        break;
      case 'human-handoff':
        if (!node.config.queueId || !node.config.queueName) {
          issues.push({
            code: 'missing-handoff-queue',
            message: 'Choose which queue or team should receive the handoff.',
            nodeId: node.id
          });
        }
        break;
      case 'set-variable':
        validateSetVariableNode(node, issues);
        break;
      case 'api-lookup':
        validateApiLookupNode(node, issues);
        break;
      case 'knowledge-answer':
        if (!node.config.knowledgeSourceId || !node.config.knowledgeSourceName) {
          issues.push({
            code: 'missing-knowledge-source',
            message: 'Select a knowledge source for this answer node.',
            nodeId: node.id
          });
        }
        break;
      default:
        break;
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

function validateAskQuestionNode(
  node: AskQuestionNode,
  issues: ValidationIssue[]
): void {
  if (!node.config.prompt.trim()) {
    issues.push({
      code: 'missing-question-prompt',
      message: 'Ask Question nodes need a prompt.',
      nodeId: node.id
    });
  }

  if (
    node.config.responseKind === 'single-choice' &&
    normalizeChoices(node.config.choices).length === 0
  ) {
    issues.push({
      code: 'missing-question-choices',
      message: 'Single-choice questions need at least one answer option.',
      nodeId: node.id
    });
  }
}

function validateCollectNode(
  node: FlowNode & { type: 'collect-variable' },
  variableKeyOwners: Map<string, string[]>,
  issues: ValidationIssue[]
): void {
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

    if (!findOutgoingEdgeForPort(flow, node.id, exit.id)) {
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

function validateConditionNode(
  flow: FlowDefinition,
  node: ConditionNode,
  issues: ValidationIssue[]
): void {
  if (node.config.rules.length === 0) {
    issues.push({
      code: 'missing-condition-rules',
      message: 'Condition nodes need at least one rule.',
      nodeId: node.id
    });
  }

  if (!node.config.defaultPortLabel.trim()) {
    issues.push({
      code: 'missing-condition-default-label',
      message: 'Condition nodes need a label for the no-match branch.',
      nodeId: node.id
    });
  }

  const ruleLabelOwners = new Map<string, string[]>();

  for (const rule of node.config.rules) {
    const label = rule.label.trim();
    const variableKey = rule.variableKey.trim();
    const value = rule.value.trim();

    if (!label) {
      issues.push({
        code: 'missing-condition-rule-label',
        message: 'Every condition rule needs a label.',
        nodeId: node.id
      });
    } else {
      const owners = ruleLabelOwners.get(label) ?? [];
      owners.push(rule.id);
      ruleLabelOwners.set(label, owners);
    }

    if (!variableKey) {
      issues.push({
        code: 'missing-condition-variable',
        message: 'Each condition rule needs a variable key.',
        nodeId: node.id
      });
    }

    if (conditionOperatorRequiresValue(rule.operator) && !value) {
      issues.push({
        code: 'missing-condition-value',
        message: 'This condition rule needs a comparison value.',
        nodeId: node.id
      });
    }

    if (!findOutgoingEdgeForPort(flow, node.id, rule.id)) {
      issues.push({
        code: 'unconnected-condition-rule',
        message: `Connect the "${label || 'unnamed'}" branch to a next step.`,
        nodeId: node.id
      });
    }
  }

  if (!findOutgoingEdgeForPort(flow, node.id, CONDITION_DEFAULT_PORT_ID)) {
    issues.push({
      code: 'unconnected-condition-default',
      message: 'Connect the no-match branch to a next step.',
      nodeId: node.id
    });
  }

  for (const owners of ruleLabelOwners.values()) {
    if (owners.length < 2) {
      continue;
    }

    issues.push({
      code: 'duplicate-condition-rule-label',
      message: 'Condition rule labels must be unique within the node.',
      nodeId: node.id
    });
  }
}

function validateSetVariableNode(
  node: FlowNode & { type: 'set-variable' },
  issues: ValidationIssue[]
): void {
  if (!node.config.targetVariableKey.trim()) {
    issues.push({
      code: 'missing-set-variable-target',
      message: 'Set Variable nodes need a target variable key.',
      nodeId: node.id
    });
  }

  if (node.config.sourceType === 'variable' && !node.config.sourceVariableKey.trim()) {
    issues.push({
      code: 'missing-set-variable-source',
      message: 'Choose which existing variable should feed this assignment.',
      nodeId: node.id
    });
  }

  if (node.config.sourceType === 'template' && !node.config.template.trim()) {
    issues.push({
      code: 'missing-set-variable-template',
      message: 'Template assignments need a template expression.',
      nodeId: node.id
    });
  }
}

function validateApiLookupNode(
  node: FlowNode & { type: 'api-lookup' },
  issues: ValidationIssue[]
): void {
  if (!node.config.endpointLabel.trim()) {
    issues.push({
      code: 'missing-api-endpoint',
      message: 'API Lookup nodes need an endpoint label.',
      nodeId: node.id
    });
  }

  if (node.config.responseMappings.length === 0) {
    issues.push({
      code: 'missing-api-response-mapping',
      message: 'Add at least one response mapping for this lookup.',
      nodeId: node.id
    });
  }

  const targetOwners = new Map<string, number>();

  for (const mapping of node.config.responseMappings) {
    const targetKey = mapping.targetKey.trim();

    if (!targetKey) {
      continue;
    }

    targetOwners.set(targetKey, (targetOwners.get(targetKey) ?? 0) + 1);
  }

  for (const [targetKey, count] of targetOwners.entries()) {
    if (count < 2) {
      continue;
    }

    issues.push({
      code: 'duplicate-api-response-mapping',
      message: `Response mappings must not target "${targetKey}" more than once.`,
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
