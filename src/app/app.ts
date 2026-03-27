import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  NodePosition,
  QuestionResponseKind,
  RouteToQueueNode,
  ValidationIssue
} from './flow-builder.models';
import {
  CONDITION_DEFAULT_PORT_ID,
  NODE_HEIGHT,
  NODE_WIDTH,
  allowsMultipleIncoming,
  buildEdgePath,
  conditionOperatorRequiresValue,
  findIncomingEdge,
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

interface DragState {
  nodeId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ConnectionSourceState {
  nodeId: string;
  portId: string | null;
}

interface ConnectionDragState extends ConnectionSourceState {
  pointerId: number;
  startPosition: NodePosition;
  currentPosition: NodePosition;
  hoveredTargetNodeId: string | null;
  didMove: boolean;
}

interface PointerLikeEvent {
  clientX: number;
  clientY: number;
  pointerId?: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

type NoticeTone = 'info' | 'success' | 'error';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  @ViewChild('canvasShell') private canvasShell?: ElementRef<HTMLElement>;

  readonly minCanvasWidth = 1600;
  readonly minCanvasHeight = 940;
  readonly queueOptions = MOCK_QUEUES;
  readonly responseKindOptions = QUESTION_RESPONSE_KIND_OPTIONS;
  readonly conditionOperatorOptions = CONDITION_OPERATOR_OPTIONS;

  readonly flow = signal<FlowDefinition>({
    nodes: [],
    edges: []
  });
  readonly selectedNodeId = signal<string | null>(null);
  readonly pendingConnectionSource = signal<ConnectionSourceState | null>(null);
  readonly connectionDrag = signal<ConnectionDragState | null>(null);
  readonly notice = signal<{
    tone: NoticeTone;
    text: string;
  }>({
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
  readonly canvasWidth = computed(() => {
    let maxWidth = this.minCanvasWidth;

    for (const node of this.flow().nodes) {
      maxWidth = Math.max(maxWidth, node.position.x + NODE_WIDTH + 120);
    }

    const connectionDrag = this.connectionDrag();

    if (connectionDrag) {
      maxWidth = Math.max(
        maxWidth,
        connectionDrag.startPosition.x + 120,
        connectionDrag.currentPosition.x + 120
      );
    }

    return maxWidth;
  });
  readonly canvasHeight = computed(() => {
    let maxHeight = this.minCanvasHeight;

    for (const node of this.flow().nodes) {
      maxHeight = Math.max(maxHeight, node.position.y + this.getNodeHeight(node) + 120);
    }

    const connectionDrag = this.connectionDrag();

    if (connectionDrag) {
      maxHeight = Math.max(
        maxHeight,
        connectionDrag.startPosition.y + 120,
        connectionDrag.currentPosition.y + 120
      );
    }

    return maxHeight;
  });
  readonly flowJson = computed(() => JSON.stringify(this.flow(), null, 2));
  readonly edgePaths = computed(() => {
    const flow = this.flow();

    return flow.edges.flatMap((edge) => {
      const sourceNode = findNode(flow, edge.sourceNodeId);
      const targetNode = findNode(flow, edge.targetNodeId);

      if (!sourceNode || !targetNode) {
        return [];
      }

      const startPoint = this.getNodeOutputPoint(sourceNode, edge.sourcePortId ?? null);
      const endPoint = this.getNodeInputPoint(targetNode);

      return [
        {
          id: edge.id,
          path: buildEdgePath(startPoint.x, startPoint.y, endPoint.x, endPoint.y)
        }
      ];
    });
  });
  readonly previewEdgePath = computed(() => {
    const connectionDrag = this.connectionDrag();

    if (!connectionDrag || !connectionDrag.didMove) {
      return null;
    }

    const sourceNode = findNode(this.flow(), connectionDrag.nodeId);

    if (!sourceNode) {
      return null;
    }

    const startPoint = this.getNodeOutputPoint(sourceNode, connectionDrag.portId);
    const targetNode =
      connectionDrag.hoveredTargetNodeId !== null
        ? findNode(this.flow(), connectionDrag.hoveredTargetNodeId)
        : undefined;
    const endPoint = targetNode
      ? this.getNodeInputPoint(targetNode)
      : connectionDrag.currentPosition;

    return buildEdgePath(startPoint.x, startPoint.y, endPoint.x, endPoint.y);
  });

  private nextNodeId = 1;
  private nextEdgeId = 1;
  private nextPortId = 1;
  private nextConditionRuleId = 1;
  private dragState: DragState | null = null;

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
    this.cancelConnectionSelection(false);
    this.setNotice(
      `${getNodeTitle(node.type)} added. Configure it in the inspector, then connect it on the canvas.`,
      'success'
    );
  }

  selectNode(nodeId: string | null): void {
    this.selectedNodeId.set(nodeId);
  }

  clearCanvasSelection(): void {
    this.selectedNodeId.set(null);
    this.cancelConnectionSelection(true);
  }

  removeSelectedNode(): void {
    const selectedNode = this.selectedNode();

    if (!selectedNode) {
      return;
    }

    const nextNodes = this.flow().nodes.filter((node) => node.id !== selectedNode.id);
    const nextEdges = this.flow().edges.filter(
      (edge) =>
        edge.sourceNodeId !== selectedNode.id && edge.targetNodeId !== selectedNode.id
    );

    this.flow.set({
      nodes: nextNodes,
      edges: nextEdges
    });
    this.selectedNodeId.set(null);

    if (
      this.pendingConnectionSource()?.nodeId === selectedNode.id ||
      this.connectionDrag()?.nodeId === selectedNode.id ||
      this.connectionDrag()?.hoveredTargetNodeId === selectedNode.id
    ) {
      this.cancelConnectionSelection(false);
    }

    this.setNotice(`${getNodeTitle(selectedNode.type)} removed.`, 'success');
  }

  beginNodeDrag(event: PointerLikeEvent, nodeId: string): void {
    const node = findNode(this.flow(), nodeId);

    if (!node) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    this.dragState = {
      nodeId,
      pointerId: event.pointerId ?? 1,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.position.x,
      originY: node.position.y
    };

    this.selectedNodeId.set(nodeId);
  }

  beginConnectionDrag(
    event: PointerLikeEvent,
    nodeId: string,
    portId: string | null = null
  ): void {
    const node = findNode(this.flow(), nodeId);

    if (!node || !this.canStartConnection(node)) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    const startPosition = this.getCanvasPointFromClient(event.clientX, event.clientY);

    this.connectionDrag.set({
      nodeId,
      portId,
      pointerId: event.pointerId ?? 1,
      startPosition,
      currentPosition: startPosition,
      hoveredTargetNodeId: null,
      didMove: false
    });
    this.pendingConnectionSource.set(null);
    this.selectedNodeId.set(nodeId);
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerLikeEvent): void {
    if (
      this.dragState &&
      (event.pointerId ?? this.dragState.pointerId) === this.dragState.pointerId
    ) {
      const node = findNode(this.flow(), this.dragState.nodeId);
      const nextX = Math.max(
        this.dragState.originX + (event.clientX - this.dragState.startX),
        24
      );
      const nextY = Math.max(
        this.dragState.originY + (event.clientY - this.dragState.startY),
        24
      );

      this.updateNode(this.dragState.nodeId, (currentNode) => ({
        ...currentNode,
        position: {
          x: nextX,
          y: nextY
        }
      }));
      return;
    }

    const connectionDrag = this.connectionDrag();

    if (!connectionDrag) {
      return;
    }

    if ((event.pointerId ?? connectionDrag.pointerId) !== connectionDrag.pointerId) {
      return;
    }

    const nextPosition = this.getCanvasPointFromClient(event.clientX, event.clientY);

    this.connectionDrag.set({
      ...connectionDrag,
      currentPosition: nextPosition,
      didMove:
        connectionDrag.didMove ||
        Math.hypot(
          nextPosition.x - connectionDrag.startPosition.x,
          nextPosition.y - connectionDrag.startPosition.y
        ) > 6
    });
  }

  @HostListener('window:pointerup', ['$event'])
  @HostListener('window:pointercancel', ['$event'])
  onWindowPointerUp(event?: PointerLikeEvent): void {
    if (
      this.dragState &&
      (!event || (event.pointerId ?? this.dragState.pointerId) === this.dragState.pointerId)
    ) {
      this.dragState = null;
      return;
    }

    const connectionDrag = this.connectionDrag();

    if (!connectionDrag) {
      return;
    }

    if (event && (event.pointerId ?? connectionDrag.pointerId) !== connectionDrag.pointerId) {
      return;
    }

    if (!connectionDrag.didMove) {
      this.connectionDrag.set(null);
      return;
    }

    if (connectionDrag.hoveredTargetNodeId) {
      this.completeConnection(
        connectionDrag.nodeId,
        connectionDrag.hoveredTargetNodeId,
        connectionDrag.portId
      );
      return;
    }

    this.connectionDrag.set(null);
    this.setNotice('Connection drag cancelled.', 'info');
  }

  handleOutputHandleClick(
    nodeId: string,
    event: Event,
    portId: string | null = null
  ): void {
    event.stopPropagation();

    const pendingConnectionSource = this.pendingConnectionSource();

    if (
      pendingConnectionSource &&
      pendingConnectionSource.nodeId === nodeId &&
      pendingConnectionSource.portId === portId
    ) {
      this.pendingConnectionSource.set(null);
      this.setNotice('Connection source cleared.', 'info');
      return;
    }

    const node = findNode(this.flow(), nodeId);

    if (!node || !this.canStartConnection(node)) {
      this.setNotice('This node cannot start a new connection.', 'error');
      return;
    }

    this.pendingConnectionSource.set({
      nodeId,
      portId
    });
    this.selectedNodeId.set(nodeId);
    this.setNotice(
      'Connection started. Drag onto a node or click an input handle to link the flow.',
      'info'
    );
  }

  handleNodeConnectionPointerEnter(nodeId: string): void {
    const connectionDrag = this.connectionDrag();

    if (!connectionDrag || !this.isNodeConnectionTarget(nodeId)) {
      return;
    }

    this.connectionDrag.set({
      ...connectionDrag,
      hoveredTargetNodeId: nodeId
    });
  }

  handleNodeConnectionPointerLeave(nodeId: string): void {
    const connectionDrag = this.connectionDrag();

    if (!connectionDrag || connectionDrag.hoveredTargetNodeId !== nodeId) {
      return;
    }

    this.connectionDrag.set({
      ...connectionDrag,
      hoveredTargetNodeId: null
    });
  }

  handleNodeConnectionPointerUp(nodeId: string, event: PointerLikeEvent): void {
    const connectionDrag = this.connectionDrag();

    if (
      !connectionDrag ||
      !connectionDrag.didMove ||
      (event.pointerId ?? connectionDrag.pointerId) !== connectionDrag.pointerId ||
      !this.isNodeConnectionTarget(nodeId)
    ) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    this.completeConnection(connectionDrag.nodeId, nodeId, connectionDrag.portId);
  }

  handleInputHandleClick(nodeId: string, event: Event): void {
    event.stopPropagation();

    if (this.connectionDrag()?.didMove) {
      return;
    }

    const pendingConnectionSource = this.pendingConnectionSource();

    if (!pendingConnectionSource) {
      this.selectedNodeId.set(nodeId);
      this.setNotice(
        'Select an output handle first, then click an input handle to connect.',
        'info'
      );
      return;
    }

    this.completeConnection(
      pendingConnectionSource.nodeId,
      nodeId,
      pendingConnectionSource.portId
    );
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

    this.clearPortSelection(node.id, exitId);
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

    this.clearPortSelection(node.id, ruleId);
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

  getNodeTitle(nodeType: FlowNodeType): string {
    return getNodeTitle(nodeType);
  }

  getNodeHeadline(node: FlowNode): string {
    switch (node.type) {
      case 'start':
        return 'Chat sequence entry';
      case 'send-message':
        return node.config.message.trim()
          ? this.truncate(node.config.message.trim(), 48)
          : 'Send a bot message';
      case 'ask-question':
        return node.config.prompt.trim()
          ? this.truncate(node.config.prompt.trim(), 48)
          : 'Ask a follow-up question';
      case 'collect-variable':
        return node.config.variableKey.trim()
          ? `Capture "${node.config.variableKey.trim()}"`
          : 'Capture a customer detail';
      case 'decision':
        return node.config.intentPrompt.trim()
          ? this.truncate(node.config.intentPrompt.trim(), 48)
          : 'Branch by customer intent';
      case 'condition':
        return node.config.rules.length
          ? `${node.config.rules.length} rule${node.config.rules.length === 1 ? '' : 's'} + no-match`
          : 'Branch on known variables';
      case 'fallback':
        return node.config.message.trim()
          ? this.truncate(node.config.message.trim(), 48)
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
          ? this.truncate(node.config.closingMessage.trim(), 48)
          : 'Close the conversation';
      case 'set-variable':
        return 'Set a derived variable';
      case 'api-lookup':
        return 'Look up external data';
      case 'knowledge-answer':
        return 'Answer from knowledge';
    }
  }

  getNodeSummary(node: FlowNode): string {
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

  getQueueDescription(node: RouteToQueueNode | HumanHandoffNode): string {
    const selectedQueue = this.queueOptions.find(
      (option) => option.id === node.config.queueId
    );

    return selectedQueue?.description ?? 'Pick a destination to route qualified chats.';
  }

  getIssuesForNode(nodeId: string): ValidationIssue[] {
    return this.nodeIssues().get(nodeId) ?? [];
  }

  hasIssuesForNode(nodeId: string): boolean {
    return this.getIssuesForNode(nodeId).length > 0;
  }

  isConnectionSourceActive(nodeId: string, portId: string | null = null): boolean {
    return (
      (this.pendingConnectionSource()?.nodeId === nodeId &&
        this.pendingConnectionSource()?.portId === portId) ||
      (this.connectionDrag()?.nodeId === nodeId && this.connectionDrag()?.portId === portId)
    );
  }

  isConnectionDropTarget(nodeId: string): boolean {
    return this.connectionDrag()?.hoveredTargetNodeId === nodeId;
  }

  canAcceptIncoming(node: FlowNode): boolean {
    return node.type !== 'start';
  }

  canStartConnection(node: FlowNode): boolean {
    return !isTerminalNode(node);
  }

  isMultiPortNode(node: FlowNode): node is DecisionNode | ConditionNode {
    return node.type === 'decision' || node.type === 'condition';
  }

  getNodeHeight(node: FlowNode): number {
    return this.isMultiPortNode(node) ? this.getMultiPortNodeHeight(node) : NODE_HEIGHT;
  }

  getOutputPorts(node: FlowNode): NodePort[] {
    if (node.type === 'decision') {
      return node.config.exits;
    }

    if (node.type === 'condition') {
      return [
        ...node.config.rules.map((rule, index) => ({
          id: rule.id,
          label: this.getConditionRuleDisplayLabel(rule.label, index)
        })),
        {
          id: CONDITION_DEFAULT_PORT_ID,
          label: this.getConditionDefaultPortDisplayLabel(node.config.defaultPortLabel)
        }
      ];
    }

    return [];
  }

  getOutputPortHandleTop(node: DecisionNode | ConditionNode, portId: string): number {
    return this.getPortCenterOffset(node, portId) - 12;
  }

  getDecisionExitDisplayLabel(label: string, index: number): string {
    return label.trim() || `Option ${index + 1}`;
  }

  getConditionRuleDisplayLabel(label: string, index: number): string {
    return label.trim() || `Rule ${index + 1}`;
  }

  getConditionDefaultPortDisplayLabel(label: string): string {
    return label.trim() || 'No match';
  }

  canRemoveDecisionExit(node: DecisionNode): boolean {
    return node.config.exits.length > 2;
  }

  isPortConnected(nodeId: string, portId: string): boolean {
    return !!findOutgoingEdgeForPort(this.flow(), nodeId, portId);
  }

  getOutputHandleTestId(nodeId: string, portId: string | null = null): string {
    return portId ? `output-${nodeId}-${portId}` : `output-${nodeId}`;
  }

  getAskChoiceText(node: AskQuestionNode): string {
    return node.config.choices.join('\n');
  }

  requiresConditionValue(operator: ConditionOperator): boolean {
    return conditionOperatorRequiresValue(operator);
  }

  trackByIssue(index: number, issue: ValidationIssue): string {
    return `${issue.code}-${issue.nodeId ?? 'global'}-${index}`;
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
    updater: (rule: ConditionNode['config']['rules'][number]) => ConditionNode['config']['rules'][number]
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

    if (!this.canStartConnection(sourceNode)) {
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

    if (this.isMultiPortNode(sourceNode)) {
      if (!sourcePortId) {
        return {
          ok: false,
          message: 'Choose a branch handle before connecting this node.'
        };
      }

      if (
        findOutgoingEdgeForPort(flow, sourceNodeId, sourcePortId) &&
        !existingSourceEdge
      ) {
        return {
          ok: false,
          message: 'That branch is already connected to another node.'
        };
      }
    } else if (findOutgoingEdge(flow, sourceNodeId) && !existingSourceEdge) {
      return {
        ok: false,
        message: 'This node already has an outgoing connection.'
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

  private completeConnection(
    sourceNodeId: string,
    targetNodeId: string,
    sourcePortId: string | null
  ): void {
    const flow = this.flow();
    const existingSourceEdge = this.getExistingSourceEdge(flow, sourceNodeId, sourcePortId);
    const validation = this.validateConnection(sourceNodeId, targetNodeId, sourcePortId);

    if (!validation.ok) {
      this.connectionDrag.set(null);
      this.pendingConnectionSource.set(null);
      this.setNotice(validation.message, 'error');
      return;
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
    this.connectionDrag.set(null);
    this.pendingConnectionSource.set(null);
    this.selectedNodeId.set(targetNodeId);
    this.setNotice(existingSourceEdge ? 'Connection rewired.' : 'Nodes connected.', 'success');
  }

  private cancelConnectionSelection(showNotice: boolean): void {
    const hadSelection = !!this.pendingConnectionSource() || !!this.connectionDrag();
    this.pendingConnectionSource.set(null);
    this.connectionDrag.set(null);

    if (showNotice && hadSelection) {
      this.setNotice('Connection selection cleared.', 'info');
    }
  }

  private clearPortSelection(nodeId: string, portId: string): void {
    const pendingConnectionSource = this.pendingConnectionSource();

    if (
      (pendingConnectionSource?.nodeId === nodeId &&
        pendingConnectionSource.portId === portId) ||
      (this.connectionDrag()?.nodeId === nodeId && this.connectionDrag()?.portId === portId)
    ) {
      this.cancelConnectionSelection(false);
    }
  }

  private getCanvasPointFromClient(clientX: number, clientY: number): NodePosition {
    const canvasShell = this.canvasShell?.nativeElement;

    if (!canvasShell) {
      return {
        x: clientX,
        y: clientY
      };
    }

    const rect = canvasShell.getBoundingClientRect();

    return {
      x: Math.max(clientX - rect.left + canvasShell.scrollLeft, 0),
      y: Math.max(clientY - rect.top + canvasShell.scrollTop, 0)
    };
  }

  private getNodeOutputPoint(node: FlowNode, sourcePortId: string | null): NodePosition {
    if (this.isMultiPortNode(node) && sourcePortId) {
      return {
        x: node.position.x + NODE_WIDTH,
        y: node.position.y + this.getPortCenterOffset(node, sourcePortId)
      };
    }

    return {
      x: node.position.x + NODE_WIDTH,
      y: node.position.y + this.getNodeHeight(node) / 2
    };
  }

  private getNodeInputPoint(node: FlowNode): NodePosition {
    return {
      x: node.position.x,
      y: node.position.y + this.getNodeHeight(node) / 2
    };
  }

  private getMultiPortNodeHeight(node: DecisionNode | ConditionNode): number {
    return Math.max(224, 152 + this.getOutputPorts(node).length * 38);
  }

  private getPortCenterOffset(node: DecisionNode | ConditionNode, portId: string): number {
    const portIndex = Math.max(
      0,
      this.getOutputPorts(node).findIndex((port) => port.id === portId)
    );

    return 136 + portIndex * 38;
  }

  private isNodeConnectionTarget(nodeId: string): boolean {
    const connectionDrag = this.connectionDrag();
    const node = findNode(this.flow(), nodeId);

    return !!connectionDrag && !!node && node.type !== 'start' && node.id !== connectionDrag.nodeId;
  }

  private setNotice(text: string, tone: NoticeTone): void {
    this.notice.set({ text, tone });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private truncate(value: string, length: number): string {
    return value.length <= length ? value : `${value.slice(0, length - 3).trimEnd()}...`;
  }

}
