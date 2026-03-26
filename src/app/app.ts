import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MOCK_QUEUES } from './flow-builder.data';
import {
  FlowDefinition,
  FlowEdge,
  FlowNode,
  FlowNodeType,
  CollectVariableNode,
  RouteToQueueNode,
  ValidationIssue
} from './flow-builder.models';
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  findIncomingEdge,
  findNode,
  findOutgoingEdge,
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
  readonly canvasWidth = 1600;
  readonly canvasHeight = 940;
  readonly queueOptions = MOCK_QUEUES;

  readonly flow = signal<FlowDefinition>({
    nodes: [],
    edges: []
  });
  readonly selectedNodeId = signal<string | null>(null);
  readonly pendingConnectionSourceId = signal<string | null>(null);
  readonly notice = signal<{
    tone: NoticeTone;
    text: string;
  }>({
    tone: 'info',
    text: 'Add a start node, collect the right variables, then end the chat in a queue route.'
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

      const startX = sourceNode.position.x + NODE_WIDTH - 10;
      const startY = sourceNode.position.y + NODE_HEIGHT / 2;
      const endX = targetNode.position.x + 10;
      const endY = targetNode.position.y + NODE_HEIGHT / 2;
      const controlOffset = Math.max(120, Math.abs(endX - startX) * 0.45);

      return [
        {
          id: edge.id,
          path: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${
            endX - controlOffset
          } ${endY}, ${endX} ${endY}`
        }
      ];
    });
  });

  private nextNodeId = 1;
  private nextEdgeId = 1;
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
    this.pendingConnectionSourceId.set(null);
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

    if (this.pendingConnectionSourceId()) {
      this.pendingConnectionSourceId.set(null);
      this.setNotice('Connection selection cleared.', 'info');
    }
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

    if (this.pendingConnectionSourceId() === selectedNode.id) {
      this.pendingConnectionSourceId.set(null);
    }

    this.setNotice(`${getNodeTitle(selectedNode.type)} removed.`, 'success');
  }

  beginDrag(event: PointerLikeEvent, nodeId: string): void {
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

  onCanvasPointerMove(event: PointerLikeEvent): void {
    if (!this.dragState) {
      return;
    }

    if ((event.pointerId ?? this.dragState.pointerId) !== this.dragState.pointerId) {
      return;
    }

    const nextX = this.clamp(
      this.dragState.originX + (event.clientX - this.dragState.startX),
      24,
      this.canvasWidth - NODE_WIDTH - 24
    );
    const nextY = this.clamp(
      this.dragState.originY + (event.clientY - this.dragState.startY),
      24,
      this.canvasHeight - NODE_HEIGHT - 24
    );

    this.updateNode(this.dragState.nodeId, (node) => ({
      ...node,
      position: {
        x: nextX,
        y: nextY
      }
    }));
  }

  onCanvasPointerUp(event?: PointerLikeEvent): void {
    if (!this.dragState) {
      return;
    }

    if (event && (event.pointerId ?? this.dragState.pointerId) !== this.dragState.pointerId) {
      return;
    }

    this.dragState = null;
  }

  handleOutputHandleClick(nodeId: string, event: Event): void {
    event.stopPropagation();

    if (this.pendingConnectionSourceId() === nodeId) {
      this.pendingConnectionSourceId.set(null);
      this.setNotice('Connection source cleared.', 'info');
      return;
    }

    const node = findNode(this.flow(), nodeId);

    if (!node || node.type === 'route-to-queue') {
      this.setNotice('Route nodes cannot start a connection.', 'error');
      return;
    }

    this.pendingConnectionSourceId.set(nodeId);
    this.selectedNodeId.set(nodeId);
    this.setNotice(
      'Connection started. Click an input handle on the next node to link the flow.',
      'info'
    );
  }

  handleInputHandleClick(nodeId: string, event: Event): void {
    event.stopPropagation();

    const sourceNodeId = this.pendingConnectionSourceId();

    if (!sourceNodeId) {
      this.selectedNodeId.set(nodeId);
      this.setNotice('Select an output handle first, then click a node input to connect.', 'info');
      return;
    }

    const validation = this.validateConnection(sourceNodeId, nodeId);

    if (!validation.ok) {
      this.setNotice(validation.message, 'error');
      return;
    }

    const flow = this.flow();
    const nextEdge: FlowEdge = {
      id: `edge-${this.nextEdgeId++}`,
      sourceNodeId,
      targetNodeId: nodeId
    };

    this.flow.set({
      nodes: flow.nodes,
      edges: [...flow.edges, nextEdge]
    });
    this.pendingConnectionSourceId.set(null);
    this.selectedNodeId.set(nodeId);
    this.setNotice('Nodes connected.', 'success');
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

  canAcceptIncoming(node: FlowNode): boolean {
    return node.type !== 'start';
  }

  canStartConnection(node: FlowNode): boolean {
    return node.type !== 'route-to-queue';
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

  private updateRouteNode(
    nodeId: string,
    updater: (node: RouteToQueueNode) => RouteToQueueNode
  ): void {
    this.updateNode(nodeId, (node) => (node.type === 'route-to-queue' ? updater(node) : node));
  }

  private validateConnection(
    sourceNodeId: string,
    targetNodeId: string
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

    if (findOutgoingEdge(flow, sourceNodeId)) {
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
        message: 'That connection would create a loop in a linear flow.'
      };
    }

    return {
      ok: true,
      message: 'Connection is valid.'
    };
  }

  private setNotice(text: string, tone: NoticeTone): void {
    this.notice.set({ text, tone });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
