import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MOCK_QUEUES } from './flow-builder.data';
import {
  CollectVariableNode,
  DecisionNode,
  FlowDefinition,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  NodePosition,
  RouteToQueueNode,
  ValidationIssue
} from './flow-builder.models';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  buildEdgePath,
  findIncomingEdge,
  findNode,
  findOutgoingEdge,
  findOutgoingEdgeForExit,
  getNodeTitle,
  groupIssuesByNode,
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
  exitId: string | null;
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

  readonly canvasWidth = 1600;
  readonly canvasHeight = 940;
  readonly queueOptions = MOCK_QUEUES;

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
    text: 'Add a start node, collect the right variables, branch if needed, then end in a queue route.'
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
  readonly edgePaths = computed(() => {
    const flow = this.flow();

    return flow.edges.flatMap((edge) => {
      const sourceNode = findNode(flow, edge.sourceNodeId);
      const targetNode = findNode(flow, edge.targetNodeId);

      if (!sourceNode || !targetNode) {
        return [];
      }

      const startPoint = this.getNodeOutputPoint(sourceNode, edge.sourceExitId ?? null);
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

    const startPoint = this.getNodeOutputPoint(sourceNode, connectionDrag.exitId);
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
  private nextDecisionExitId = 1;
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
    exitId: string | null = null
  ): void {
    const node = findNode(this.flow(), nodeId);

    if (!node || node.type === 'route-to-queue') {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();

    const startPosition = this.getCanvasPointFromClient(event.clientX, event.clientY);

    this.connectionDrag.set({
      nodeId,
      exitId,
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
    if (this.dragState && (event.pointerId ?? this.dragState.pointerId) === this.dragState.pointerId) {
      const node = findNode(this.flow(), this.dragState.nodeId);
      const nodeHeight = node ? this.getNodeHeight(node) : NODE_HEIGHT;
      const nextX = this.clamp(
        this.dragState.originX + (event.clientX - this.dragState.startX),
        24,
        this.canvasWidth - NODE_WIDTH - 24
      );
      const nextY = this.clamp(
        this.dragState.originY + (event.clientY - this.dragState.startY),
        24,
        this.canvasHeight - nodeHeight - 24
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
    if (this.dragState && (!event || (event.pointerId ?? this.dragState.pointerId) === this.dragState.pointerId)) {
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
        connectionDrag.exitId
      );
      return;
    }

    this.connectionDrag.set(null);
    this.setNotice('Connection drag cancelled.', 'info');
  }

  handleOutputHandleClick(
    nodeId: string,
    event: Event,
    exitId: string | null = null
  ): void {
    event.stopPropagation();

    const pendingConnectionSource = this.pendingConnectionSource();

    if (
      pendingConnectionSource &&
      pendingConnectionSource.nodeId === nodeId &&
      pendingConnectionSource.exitId === exitId
    ) {
      this.pendingConnectionSource.set(null);
      this.setNotice('Connection source cleared.', 'info');
      return;
    }

    const node = findNode(this.flow(), nodeId);

    if (!node || node.type === 'route-to-queue') {
      this.setNotice('Route nodes cannot start a connection.', 'error');
      return;
    }

    this.pendingConnectionSource.set({
      nodeId,
      exitId
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
    this.completeConnection(connectionDrag.nodeId, nodeId, connectionDrag.exitId);
  }

  handleInputHandleClick(nodeId: string, event: Event): void {
    event.stopPropagation();

    if (this.connectionDrag()?.didMove) {
      return;
    }

    const pendingConnectionSource = this.pendingConnectionSource();

    if (!pendingConnectionSource) {
      this.selectedNodeId.set(nodeId);
      this.setNotice('Select an output handle first, then click an input handle to connect.', 'info');
      return;
    }

    this.completeConnection(
      pendingConnectionSource.nodeId,
      nodeId,
      pendingConnectionSource.exitId
    );
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
        exits: [
          ...currentNode.config.exits,
          this.createDecisionExit(`Option ${nextExitNumber}`)
        ]
      }
    }));
  }

  removeDecisionExit(exitId: string): void {
    const node = this.selectedNode();

    if (!node || node.type !== 'decision' || node.config.exits.length <= 2) {
      return;
    }

    const flow = this.flow();

    this.flow.set({
      nodes: flow.nodes.map((currentNode) => {
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
      edges: flow.edges.filter(
        (edge) => !(edge.sourceNodeId === node.id && edge.sourceExitId === exitId)
      )
    });

    const pendingConnectionSource = this.pendingConnectionSource();

    if (
      (pendingConnectionSource?.nodeId === node.id &&
        pendingConnectionSource.exitId === exitId) ||
      (this.connectionDrag()?.nodeId === node.id && this.connectionDrag()?.exitId === exitId)
    ) {
      this.cancelConnectionSelection(false);
    }
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

  getNodeTitle(nodeType: FlowNodeType): string {
    return getNodeTitle(nodeType);
  }

  getNodeHeadline(node: FlowNode): string {
    switch (node.type) {
      case 'start':
        return 'Chat sequence entry';
      case 'collect-variable':
        return node.config.variableKey.trim()
          ? `Capture "${node.config.variableKey.trim()}"`
          : 'Capture a customer detail';
      case 'decision':
        return node.config.intentPrompt.trim()
          ? node.config.intentPrompt.trim()
          : 'Branch based on what the user wants';
      case 'route-to-queue':
        return node.config.queueName
          ? `Send to ${node.config.queueName}`
          : 'Choose a queue destination';
    }
  }

  getNodeSummary(node: FlowNode): string {
    switch (node.type) {
      case 'start':
        return 'Use this node to anchor the first step of the chat AI sequence.';
      case 'collect-variable':
        return node.config.prompt.trim()
          ? node.config.prompt.trim()
          : 'Ask the user for a value and store it as a reusable variable.';
      case 'decision':
        return `${node.config.exits.length} exits let you route to different next steps based on intent.`;
      case 'route-to-queue':
        return node.config.queueName
          ? 'Conversation ends here and routes to the selected team queue.'
          : 'Choose which queue should receive the conversation after qualification.';
    }
  }

  getQueueDescription(node: RouteToQueueNode): string {
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

  isConnectionSourceActive(nodeId: string, exitId: string | null = null): boolean {
    return (
      (this.pendingConnectionSource()?.nodeId === nodeId &&
        this.pendingConnectionSource()?.exitId === exitId) ||
      (this.connectionDrag()?.nodeId === nodeId && this.connectionDrag()?.exitId === exitId)
    );
  }

  isConnectionDropTarget(nodeId: string): boolean {
    return this.connectionDrag()?.hoveredTargetNodeId === nodeId;
  }

  canAcceptIncoming(node: FlowNode): boolean {
    return node.type !== 'start';
  }

  canStartConnection(node: FlowNode): boolean {
    return node.type !== 'route-to-queue';
  }

  isDecisionNode(node: FlowNode): node is DecisionNode {
    return node.type === 'decision';
  }

  getDecisionNodeHeight(node: DecisionNode): number {
    return Math.max(224, 152 + node.config.exits.length * 38);
  }

  getNodeHeight(node: FlowNode): number {
    return this.isDecisionNode(node) ? this.getDecisionNodeHeight(node) : NODE_HEIGHT;
  }

  getDecisionExitHandleTop(node: DecisionNode, exitId: string): number {
    return this.getDecisionExitCenterOffset(node, exitId) - 12;
  }

  getDecisionExitDisplayLabel(label: string, index: number): string {
    return label.trim() || `Option ${index + 1}`;
  }

  canRemoveDecisionExit(node: DecisionNode): boolean {
    return node.config.exits.length > 2;
  }

  isDecisionExitConnected(nodeId: string, exitId: string): boolean {
    return !!findOutgoingEdgeForExit(this.flow(), nodeId, exitId);
  }

  getDecisionExitStatus(nodeId: string, exitId: string): string {
    return this.isDecisionExitConnected(nodeId, exitId) ? 'Connected' : 'Needs connection';
  }

  getOutputHandleTestId(nodeId: string, exitId: string | null = null): string {
    return exitId ? `output-${nodeId}-${exitId}` : `output-${nodeId}`;
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
            exits: [
              this.createDecisionExit('Option 1'),
              this.createDecisionExit('Option 2')
            ]
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
    }
  }

  private createDecisionExit(label: string): DecisionNode['config']['exits'][number] {
    return {
      id: `decision-exit-${this.nextDecisionExitId++}`,
      label
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

  private updateRouteNode(
    nodeId: string,
    updater: (node: RouteToQueueNode) => RouteToQueueNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'route-to-queue' ? updater(node) : node));
  }

  private validateConnection(
    sourceNodeId: string,
    targetNodeId: string,
    sourceExitId: string | null
  ): { ok: true; message: string } | { ok: false; message: string } {
    const flow = this.flow();
    const sourceNode = findNode(flow, sourceNodeId);
    const targetNode = findNode(flow, targetNodeId);

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

    if (sourceNode.type === 'route-to-queue') {
      return {
        ok: false,
        message: 'Route nodes are terminal and cannot start a connection.'
      };
    }

    if (targetNode.type === 'start') {
      return {
        ok: false,
        message: 'Connections cannot target the start node.'
      };
    }

    if (sourceNode.type === 'decision') {
      if (!sourceExitId) {
        return {
          ok: false,
          message: 'Choose a decision exit before connecting this branch.'
        };
      }

      if (findOutgoingEdgeForExit(flow, sourceNodeId, sourceExitId)) {
        return {
          ok: false,
          message: 'That exit is already connected to another node.'
        };
      }
    } else if (findOutgoingEdge(flow, sourceNodeId)) {
      return {
        ok: false,
        message: 'This node already has an outgoing connection.'
      };
    }

    if (findIncomingEdge(flow, targetNodeId)) {
      return {
        ok: false,
        message: 'This node already has an incoming connection.'
      };
    }

    if (wouldCreateCycle(flow, sourceNodeId, targetNodeId)) {
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
    sourceExitId: string | null
  ): void {
    const validation = this.validateConnection(sourceNodeId, targetNodeId, sourceExitId);

    if (!validation.ok) {
      this.connectionDrag.set(null);
      this.pendingConnectionSource.set(null);
      this.setNotice(validation.message, 'error');
      return;
    }

    const flow = this.flow();
    const nextEdge: FlowEdge = {
      id: `edge-${this.nextEdgeId++}`,
      sourceNodeId,
      targetNodeId,
      ...(sourceExitId ? { sourceExitId } : {})
    };

    this.flow.set({
      nodes: flow.nodes,
      edges: [...flow.edges, nextEdge]
    });
    this.connectionDrag.set(null);
    this.pendingConnectionSource.set(null);
    this.selectedNodeId.set(targetNodeId);
    this.setNotice('Nodes connected.', 'success');
  }

  private cancelConnectionSelection(showNotice: boolean): void {
    const hadSelection = !!this.pendingConnectionSource() || !!this.connectionDrag();
    this.pendingConnectionSource.set(null);
    this.connectionDrag.set(null);

    if (showNotice && hadSelection) {
      this.setNotice('Connection selection cleared.', 'info');
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
      x: this.clamp(clientX - rect.left + canvasShell.scrollLeft, 0, this.canvasWidth),
      y: this.clamp(clientY - rect.top + canvasShell.scrollTop, 0, this.canvasHeight)
    };
  }

  private getNodeOutputPoint(node: FlowNode, sourceExitId: string | null): NodePosition {
    if (this.isDecisionNode(node) && sourceExitId) {
      return {
        x: node.position.x + NODE_WIDTH,
        y: node.position.y + this.getDecisionExitCenterOffset(node, sourceExitId)
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

  private getDecisionExitCenterOffset(node: DecisionNode, exitId: string): number {
    const exitIndex = Math.max(
      0,
      node.config.exits.findIndex((exit) => exit.id === exitId)
    );

    return 136 + exitIndex * 38;
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
}
