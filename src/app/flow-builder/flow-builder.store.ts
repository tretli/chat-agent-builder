import { Injectable, computed, signal } from '@angular/core';
import {
  CONDITION_OPERATOR_OPTIONS,
  MOCK_QUEUES,
  QUESTION_RESPONSE_KIND_OPTIONS
} from './flow-builder.data';
import {
  AskQuestionNode,
  CollectVariableNode,
  ConditionNode,
  ConditionOperator,
  DecisionNode,
  FlowDefinition,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  HumanHandoffNode,
  NodePort,
  QuestionResponseKind,
  RouteToQueueNode,
  ValidationIssue
} from './flow-builder.models';
import {
  allowsMultipleIncoming,
  conditionOperatorRequiresValue,
  findIncomingEdges,
  findNode,
  findOutgoingEdge,
  findOutgoingEdgeForPort,
  getNodeTitle,
  groupIssuesByNode,
  isTerminalNode,
  normalizeChoices,
  validateFlow,
  wouldCreateCycle
} from './flow-builder.utils';

export type NoticeTone = 'info' | 'success' | 'error';

export interface FlowBuilderNotice {
  tone: NoticeTone;
  text: string;
}

@Injectable()
export class FlowBuilderStore {
  readonly queueOptions = MOCK_QUEUES;
  readonly responseKindOptions = QUESTION_RESPONSE_KIND_OPTIONS;
  readonly conditionOperatorOptions = CONDITION_OPERATOR_OPTIONS;

  readonly flow = signal<FlowDefinition>({
    nodes: [],
    edges: []
  });
  readonly selectedNodeId = signal<string | null>(null);
  readonly notice = signal<FlowBuilderNotice>({
    tone: 'info',
    text: 'Add a start node, shape the conversation with messages and questions, then branch into a route, handoff, or clean ending.'
  });

  readonly selectedNode = computed(() => {
    const selectedNodeId = this.selectedNodeId();

    if (!selectedNodeId) {
      return null;
    }

    return findNode(this.flow(), selectedNodeId) ?? null;
  });
  readonly validationIssues = computed(() => validateFlow(this.flow()));
  readonly nodeIssues = computed(() => groupIssuesByNode(this.validationIssues()));
  readonly hasStartNode = computed(() =>
    this.flow().nodes.some((node) => node.type === 'start')
  );
  readonly flowJson = computed(() => JSON.stringify(this.flow(), null, 2));

  private nextNodeId = 1;
  private nextEdgeId = 1;
  private nextPortId = 1;
  private nextConditionRuleId = 1;

  addNode(nodeType: FlowNodeType): void {
    if (nodeType === 'start' && this.hasStartNode()) {
      this.setNotice('This builder allows only one start node.', 'error');
      return;
    }

    const flow = this.flow();
    const node = this.createNode(nodeType, flow.nodes.length);

    this.flow.set({
      nodes: [...flow.nodes, node],
      edges: flow.edges
    });
    this.selectedNodeId.set(node.id);
    this.setNotice(
      `${getNodeTitle(node.type)} added. Configure it in the inspector, then connect it on the canvas.`,
      'success'
    );
  }

  selectNode(nodeId: string | null): void {
    this.selectedNodeId.set(nodeId);
  }

  removeSelectedNode(): void {
    const selectedNode = this.selectedNode();

    if (!selectedNode) {
      return;
    }

    this.flow.set({
      nodes: this.flow().nodes.filter((node) => node.id !== selectedNode.id),
      edges: this.flow().edges.filter(
        (edge) =>
          edge.sourceNodeId !== selectedNode.id && edge.targetNodeId !== selectedNode.id
      )
    });
    this.selectedNodeId.set(null);
    this.setNotice(`${getNodeTitle(selectedNode.type)} removed.`, 'success');
  }

  updateNodePosition(nodeId: string, x: number, y: number): void {
    this.updateNode(nodeId, (node) => ({
      ...node,
      position: { x, y }
    }));
  }

  updateSelectedSendMessage(message: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'send-message') {
      return;
    }

    this.updateNode(node.id, (currentNode) =>
      currentNode.type === 'send-message'
        ? {
            ...currentNode,
            config: {
              message
            }
          }
        : currentNode
    );
  }

  updateSelectedAskPrompt(prompt: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'ask-question') {
      return;
    }

    this.updateAskQuestionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        prompt
      }
    }));
  }

  updateSelectedAskResponseKind(responseKind: QuestionResponseKind): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'ask-question') {
      return;
    }

    this.updateAskQuestionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        responseKind,
        choices:
          responseKind === 'single-choice'
            ? currentNode.config.choices
            : normalizeChoices(currentNode.config.choices)
      }
    }));
  }

  updateSelectedAskChoices(choiceText: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'ask-question') {
      return;
    }

    this.updateAskQuestionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        choices: normalizeChoices(choiceText.split(/\r?\n/))
      }
    }));
  }

  updateSelectedVariableKey(variableKey: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'collect-variable') {
      return;
    }

    this.updateCollectNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        variableKey
      }
    }));
  }

  updateSelectedPrompt(prompt: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'collect-variable') {
      return;
    }

    this.updateCollectNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        prompt
      }
    }));
  }

  updateSelectedRequired(required: boolean): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'collect-variable') {
      return;
    }

    this.updateCollectNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        required
      }
    }));
  }

  updateSelectedDecisionPrompt(intentPrompt: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'decision') {
      return;
    }

    this.updateDecisionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        intentPrompt
      }
    }));
  }

  updateDecisionExitLabel(exitId: string, label: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'decision') {
      return;
    }

    this.updateDecisionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        exits: currentNode.config.exits.map((exit) =>
          exit.id === exitId
            ? {
                ...exit,
                label
              }
            : exit
        )
      }
    }));
  }

  addDecisionExit(): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'decision') {
      return;
    }

    const nextExitNumber = node.config.exits.length + 1;

    this.updateDecisionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        exits: [...currentNode.config.exits, this.createPort(`Option ${nextExitNumber}`)]
      }
    }));
  }

  removeDecisionExit(exitId: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'decision' || node.config.exits.length <= 2) {
      return;
    }

    this.flow.set({
      nodes: this.flow().nodes.map((currentNode) => {
        if (currentNode.id !== node.id || currentNode.type !== 'decision') {
          return currentNode;
        }

        return {
          ...currentNode,
          config: {
            ...currentNode.config,
            exits: currentNode.config.exits.filter((exit) => exit.id !== exitId)
          }
        };
      }),
      edges: this.flow().edges.filter(
        (edge) => !(edge.sourceNodeId === node.id && edge.sourcePortId === exitId)
      )
    });
  }

  updateSelectedConditionDefaultPortLabel(label: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'condition') {
      return;
    }

    this.updateConditionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        defaultPortLabel: label
      }
    }));
  }

  updateConditionRuleLabel(ruleId: string, label: string): void {
    this.updateConditionRule(ruleId, (rule) => ({
      ...rule,
      label
    }));
  }

  updateConditionRuleVariableKey(ruleId: string, variableKey: string): void {
    this.updateConditionRule(ruleId, (rule) => ({
      ...rule,
      variableKey
    }));
  }

  updateConditionRuleOperator(ruleId: string, operator: ConditionOperator): void {
    this.updateConditionRule(ruleId, (rule) => ({
      ...rule,
      operator,
      value: conditionOperatorRequiresValue(operator) ? rule.value : ''
    }));
  }

  updateConditionRuleValue(ruleId: string, value: string): void {
    this.updateConditionRule(ruleId, (rule) => ({
      ...rule,
      value
    }));
  }

  addConditionRule(): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'condition') {
      return;
    }

    const nextRuleNumber = node.config.rules.length + 1;

    this.updateConditionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        rules: [...currentNode.config.rules, this.createConditionRule(`Rule ${nextRuleNumber}`)]
      }
    }));
  }

  removeConditionRule(ruleId: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'condition') {
      return;
    }

    this.flow.set({
      nodes: this.flow().nodes.map((currentNode) => {
        if (currentNode.id !== node.id || currentNode.type !== 'condition') {
          return currentNode;
        }

        return {
          ...currentNode,
          config: {
            ...currentNode.config,
            rules: currentNode.config.rules.filter((rule) => rule.id !== ruleId)
          }
        };
      }),
      edges: this.flow().edges.filter(
        (edge) => !(edge.sourceNodeId === node.id && edge.sourcePortId === ruleId)
      )
    });
  }

  updateSelectedFallbackMessage(message: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'fallback') {
      return;
    }

    this.updateNode(node.id, (currentNode) =>
      currentNode.type === 'fallback'
        ? {
            ...currentNode,
            config: {
              message
            }
          }
        : currentNode
    );
  }

  updateSelectedQueue(queueId: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'route-to-queue') {
      return;
    }

    const queueOption = this.queueOptions.find((option) => option.id === queueId);

    this.updateRouteNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        queueId: queueOption?.id ?? '',
        queueName: queueOption?.name ?? ''
      }
    }));
  }

  updateSelectedHandoffQueue(queueId: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'human-handoff') {
      return;
    }

    const queueOption = this.queueOptions.find((option) => option.id === queueId);

    this.updateHumanHandoffNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        queueId: queueOption?.id ?? '',
        queueName: queueOption?.name ?? ''
      }
    }));
  }

  updateSelectedTransferMessage(transferMessage: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'human-handoff') {
      return;
    }

    this.updateHumanHandoffNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        transferMessage
      }
    }));
  }

  updateSelectedClosingMessage(closingMessage: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'end-conversation') {
      return;
    }

    this.updateNode(node.id, (currentNode) =>
      currentNode.type === 'end-conversation'
        ? {
            ...currentNode,
            config: {
              closingMessage
            }
          }
        : currentNode
    );
  }

  getIssuesForNode(nodeId: string): ValidationIssue[] {
    return this.nodeIssues().get(nodeId) ?? [];
  }

  hasIssuesForNode(nodeId: string): boolean {
    return this.getIssuesForNode(nodeId).length > 0;
  }

  isPortConnected(nodeId: string, portId: string): boolean {
    return !!findOutgoingEdgeForPort(this.flow(), nodeId, portId);
  }

  connectNodes(
    sourceNodeId: string,
    targetNodeId: string,
    sourcePortId: string | null
  ): { ok: true; rewired: boolean } | { ok: false } {
    const flow = this.flow();
    const existingSourceEdge = this.getExistingSourceEdge(flow, sourceNodeId, sourcePortId);
    const validation = this.validateConnection(sourceNodeId, targetNodeId, sourcePortId);

    if (!validation.ok) {
      this.setNotice(validation.message, 'error');
      return {
        ok: false
      };
    }

    this.flow.set({
      nodes: flow.nodes,
      edges: existingSourceEdge
        ? flow.edges.map((edge) =>
            edge.id === existingSourceEdge.id
              ? {
                  ...edge,
                  sourceNodeId,
                  targetNodeId,
                  ...(sourcePortId ? { sourcePortId } : {})
                }
              : edge
          )
        : [
            ...flow.edges,
            {
              id: `edge-${this.nextEdgeId++}`,
              sourceNodeId,
              targetNodeId,
              ...(sourcePortId ? { sourcePortId } : {})
            } satisfies FlowEdge
          ]
    });
    this.selectedNodeId.set(targetNodeId);
    this.setNotice(existingSourceEdge ? 'Connection rewired.' : 'Nodes connected.', 'success');

    return {
      ok: true,
      rewired: !!existingSourceEdge
    };
  }

  setNotice(text: string, tone: NoticeTone): void {
    this.notice.set({ text, tone });
  }

  private createNode(nodeType: FlowNodeType, index: number): FlowNode {
    const position = this.getSuggestedPosition(index);
    const id = `node-${this.nextNodeId++}`;

    switch (nodeType) {
      case 'start':
        return {
          id,
          type: 'start',
          position,
          config: {}
        };
      case 'send-message':
        return {
          id,
          type: 'send-message',
          position,
          config: {
            message: ''
          }
        };
      case 'ask-question':
        return {
          id,
          type: 'ask-question',
          position,
          config: {
            prompt: '',
            responseKind: 'short-text',
            choices: []
          }
        };
      case 'collect-variable':
        return {
          id,
          type: 'collect-variable',
          position,
          config: {
            variableKey: '',
            prompt: '',
            required: true
          }
        };
      case 'decision':
        return {
          id,
          type: 'decision',
          position,
          config: {
            intentPrompt: '',
            exits: [this.createPort('Option 1'), this.createPort('Option 2')]
          }
        };
      case 'condition':
        return {
          id,
          type: 'condition',
          position,
          config: {
            rules: [this.createConditionRule('Rule 1')],
            defaultPortLabel: 'No match'
          }
        };
      case 'fallback':
        return {
          id,
          type: 'fallback',
          position,
          config: {
            message: ''
          }
        };
      case 'route-to-queue':
        return {
          id,
          type: 'route-to-queue',
          position,
          config: {
            queueId: '',
            queueName: ''
          }
        };
      case 'human-handoff':
        return {
          id,
          type: 'human-handoff',
          position,
          config: {
            queueId: '',
            queueName: '',
            transferMessage: ''
          }
        };
      case 'end-conversation':
        return {
          id,
          type: 'end-conversation',
          position,
          config: {
            closingMessage: ''
          }
        };
      case 'set-variable':
        return {
          id,
          type: 'set-variable',
          position,
          config: {
            targetVariableKey: '',
            sourceType: 'static',
            staticValue: '',
            sourceVariableKey: '',
            template: ''
          }
        };
      case 'api-lookup':
        return {
          id,
          type: 'api-lookup',
          position,
          config: {
            lookupName: '',
            method: 'GET',
            endpointLabel: '',
            requestMappings: [],
            responseMappings: []
          }
        };
      case 'knowledge-answer':
        return {
          id,
          type: 'knowledge-answer',
          position,
          config: {
            knowledgeSourceId: '',
            knowledgeSourceName: '',
            answerInstructions: ''
          }
        };
    }
  }

  private createPort(label: string): NodePort {
    return {
      id: `port-${this.nextPortId++}`,
      label
    };
  }

  private createConditionRule(label: string): ConditionNode['config']['rules'][number] {
    return {
      id: `condition-rule-${this.nextConditionRuleId++}`,
      label,
      variableKey: '',
      operator: 'equals',
      value: ''
    };
  }

  private getSuggestedPosition(index: number): { x: number; y: number } {
    const column = index % 2;
    const row = Math.floor(index / 2);

    return {
      x: 96 + column * 320,
      y: 88 + row * 220
    };
  }

  private updateNode(nodeId: string, updater: (node: FlowNode) => FlowNode): void {
    const flow = this.flow();

    this.flow.set({
      nodes: flow.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
      edges: flow.edges
    });
  }

  private updateAskQuestionNode(
    nodeId: string,
    updater: (node: AskQuestionNode) => AskQuestionNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'ask-question' ? updater(node) : node));
  }

  private updateCollectNode(
    nodeId: string,
    updater: (node: CollectVariableNode) => CollectVariableNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'collect-variable' ? updater(node) : node));
  }

  private updateDecisionNode(
    nodeId: string,
    updater: (node: DecisionNode) => DecisionNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'decision' ? updater(node) : node));
  }

  private updateConditionNode(
    nodeId: string,
    updater: (node: ConditionNode) => ConditionNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'condition' ? updater(node) : node));
  }

  private updateRouteNode(
    nodeId: string,
    updater: (node: RouteToQueueNode) => RouteToQueueNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'route-to-queue' ? updater(node) : node));
  }

  private updateHumanHandoffNode(
    nodeId: string,
    updater: (node: HumanHandoffNode) => HumanHandoffNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'human-handoff' ? updater(node) : node));
  }

  private updateConditionRule(
    ruleId: string,
    updater: (
      rule: ConditionNode['config']['rules'][number]
    ) => ConditionNode['config']['rules'][number]
  ): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'condition') {
      return;
    }

    this.updateConditionNode(node.id, (currentNode) => ({
      ...currentNode,
      config: {
        ...currentNode.config,
        rules: currentNode.config.rules.map((rule) =>
          rule.id === ruleId ? updater(rule) : rule
        )
      }
    }));
  }

  private getExistingSourceEdge(
    flow: FlowDefinition,
    sourceNodeId: string,
    sourcePortId: string | null
  ): FlowEdge | undefined {
    return sourcePortId
      ? findOutgoingEdgeForPort(flow, sourceNodeId, sourcePortId)
      : findOutgoingEdge(flow, sourceNodeId);
  }

  private validateConnection(
    sourceNodeId: string,
    targetNodeId: string,
    sourcePortId: string | null
  ): { ok: true; message: string } | { ok: false; message: string } {
    const flow = this.flow();
    const sourceNode = findNode(flow, sourceNodeId);
    const targetNode = findNode(flow, targetNodeId);
    const existingSourceEdge = this.getExistingSourceEdge(flow, sourceNodeId, sourcePortId);

    if (!sourceNode || !targetNode) {
      return {
        ok: false,
        message: 'Both nodes must exist before they can be connected.'
      };
    }

    if (sourceNodeId === targetNodeId) {
      return {
        ok: false,
        message: 'A node cannot connect to itself.'
      };
    }

    if (isTerminalNode(sourceNode)) {
      return {
        ok: false,
        message: 'This node is terminal and cannot start a connection.'
      };
    }

    if (targetNode.type === 'start') {
      return {
        ok: false,
        message: 'Connections cannot target the start node.'
      };
    }

    const competingIncomingEdges = findIncomingEdges(flow, targetNodeId).filter(
      (edge) => edge.id !== existingSourceEdge?.id
    );

    if (!allowsMultipleIncoming(targetNode) && competingIncomingEdges.length > 0) {
      return {
        ok: false,
        message: 'This node already has an incoming connection.'
      };
    }

    if (wouldCreateCycle(flow, sourceNodeId, targetNodeId, existingSourceEdge?.id)) {
      return {
        ok: false,
        message: 'That connection would create a loop in the flow.'
      };
    }

    return {
      ok: true,
      message: 'Connection is valid.'
    };
  }
}
