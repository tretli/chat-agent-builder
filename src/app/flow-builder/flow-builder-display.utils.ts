import {
  AskQuestionNode,
  ConditionNode,
  ConditionOperator,
  DecisionNode,
  FlowNode,
  HumanHandoffNode,
  NodePort,
  QueueOption,
  RouteToQueueNode
} from './flow-builder.models';
import {
  CONDITION_DEFAULT_PORT_ID,
  NODE_HEIGHT,
  conditionOperatorRequiresValue,
  normalizeChoices
} from './flow-builder.utils';

export function isMultiPortNode(node: FlowNode): node is DecisionNode | ConditionNode {
  return node.type === 'decision' || node.type === 'condition';
}

export function getNodeHeadline(node: FlowNode): string {
  switch (node.type) {
    case 'start':
      return 'Chat sequence entry';
    case 'send-message':
      return node.config.message.trim()
        ? truncate(node.config.message.trim(), 48)
        : 'Send a bot message';
    case 'ask-question':
      return node.config.prompt.trim()
        ? truncate(node.config.prompt.trim(), 48)
        : 'Ask a follow-up question';
    case 'collect-variable':
      return node.config.variableKey.trim()
        ? `Capture "${node.config.variableKey.trim()}"`
        : 'Capture a customer detail';
    case 'decision':
      return node.config.intentPrompt.trim()
        ? truncate(node.config.intentPrompt.trim(), 48)
        : 'Branch by customer intent';
    case 'condition':
      return node.config.rules.length
        ? `${node.config.rules.length} rule${node.config.rules.length === 1 ? '' : 's'} + no-match`
        : 'Branch on known variables';
    case 'fallback':
      return node.config.message.trim()
        ? truncate(node.config.message.trim(), 48)
        : 'Handle unclear intent';
    case 'route-to-queue':
      return node.config.queueName
        ? `Route to ${node.config.queueName}`
        : 'Choose a queue destination';
    case 'human-handoff':
      return node.config.queueName
        ? `Escalate to ${node.config.queueName}`
        : 'Escalate to a human';
    case 'end-conversation':
      return node.config.closingMessage.trim()
        ? truncate(node.config.closingMessage.trim(), 48)
        : 'Close the conversation';
    case 'set-variable':
      return 'Set a derived variable';
    case 'api-lookup':
      return 'Look up external data';
    case 'knowledge-answer':
      return 'Answer from knowledge';
  }
}

export function getNodeSummary(node: FlowNode): string {
  switch (node.type) {
    case 'start':
      return 'Use this node to anchor the first step of the chat AI sequence.';
    case 'send-message':
      return 'Send bot copy to the user, then continue to the next step.';
    case 'ask-question':
      return node.config.responseKind === 'single-choice'
        ? `${normalizeChoices(node.config.choices).length || 0} choices guide the next reply without storing a named variable.`
        : 'Capture transient conversational context without creating a reusable variable.';
    case 'collect-variable':
      return node.config.prompt.trim()
        ? node.config.prompt.trim()
        : 'Ask the user for a value and store it as a reusable variable.';
    case 'decision':
      return `${node.config.exits.length} exits let you route to different next steps based on intent.`;
    case 'condition':
      return 'Evaluate stored variables with structured rules and a required no-match branch.';
    case 'fallback':
      return 'Catch unclear or unmatched states before rerouting, handing off, or ending cleanly.';
    case 'route-to-queue':
      return node.config.queueName
        ? 'Conversation ends here and routes to the selected team queue.'
        : 'Choose which queue should receive the conversation after qualification.';
    case 'human-handoff':
      return 'Escalate the conversation to a human queue with optional transfer context.';
    case 'end-conversation':
      return 'End the chat flow cleanly, with an optional final message.';
    case 'set-variable':
      return 'Phase 2: derive or rewrite a reusable variable.';
    case 'api-lookup':
      return 'Phase 2: map flow variables into a lookup contract and map the response back out.';
    case 'knowledge-answer':
      return 'Phase 2: answer a question from a knowledge source and continue the flow.';
  }
}

export function getQueueDescription(
  node: RouteToQueueNode | HumanHandoffNode,
  queueOptions: QueueOption[]
): string {
  const selectedQueue = queueOptions.find((option) => option.id === node.config.queueId);

  return selectedQueue?.description ?? 'Pick a destination to route qualified chats.';
}

export function getOutputPorts(node: FlowNode): NodePort[] {
  if (node.type === 'decision') {
    return node.config.exits;
  }

  if (node.type === 'condition') {
    return [
      ...node.config.rules.map((rule, index) => ({
        id: rule.id,
        label: getConditionRuleDisplayLabel(rule.label, index)
      })),
      {
        id: CONDITION_DEFAULT_PORT_ID,
        label: getConditionDefaultPortDisplayLabel(node.config.defaultPortLabel)
      }
    ];
  }

  return [];
}

export function getNodeHeight(node: FlowNode): number {
  return isMultiPortNode(node) ? getMultiPortNodeHeight(node) : NODE_HEIGHT;
}

export function getOutputPortHandleTop(
  node: DecisionNode | ConditionNode,
  portId: string
): number {
  return getPortCenterOffset(node, portId) - 12;
}

export function getDecisionExitDisplayLabel(label: string, index: number): string {
  return label.trim() || `Option ${index + 1}`;
}

export function getConditionRuleDisplayLabel(label: string, index: number): string {
  return label.trim() || `Rule ${index + 1}`;
}

export function getConditionDefaultPortDisplayLabel(label: string): string {
  return label.trim() || 'No match';
}

export function canRemoveDecisionExit(node: DecisionNode): boolean {
  return node.config.exits.length > 2;
}

export function getAskChoiceText(node: AskQuestionNode): string {
  return node.config.choices.join('\n');
}

export function requiresConditionValue(operator: ConditionOperator): boolean {
  return conditionOperatorRequiresValue(operator);
}

function getMultiPortNodeHeight(node: DecisionNode | ConditionNode): number {
  return Math.max(224, 152 + getOutputPorts(node).length * 38);
}

function getPortCenterOffset(node: DecisionNode | ConditionNode, portId: string): number {
  const portIndex = Math.max(
    0,
    getOutputPorts(node).findIndex((port) => port.id === portId)
  );

  return 136 + portIndex * 38;
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 3).trimEnd()}...`;
}
