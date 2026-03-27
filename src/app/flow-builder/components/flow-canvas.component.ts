import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import {
  getNodeHeadline,
  getNodeHeight,
  getNodeSummary,
  getOutputPortHandleTop,
  getOutputPorts,
  isMultiPortNode
} from '../flow-builder-display.utils';
import {
  ConditionNode,
  DecisionNode,
  FlowDefinition,
  FlowNode,
  NodePosition
} from '../flow-builder.models';
import { FlowBuilderStore } from '../flow-builder.store';
import {
  NODE_WIDTH,
  buildEdgePath,
  findNode,
  getNodeTitle,
  isTerminalNode
} from '../flow-builder.utils';

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

@Component({
  selector: 'app-flow-canvas',
  templateUrl: './flow-canvas.component.html',
  styleUrl: './flow-canvas.component.css'
})
export class FlowCanvasComponent {
  @ViewChild('canvasShell') private canvasShell?: ElementRef<HTMLElement>;

  readonly store = inject(FlowBuilderStore);
  readonly minCanvasWidth = 1600;
  readonly minCanvasHeight = 940;
  readonly pendingConnectionSource = signal<ConnectionSourceState | null>(null);
  readonly connectionDrag = signal<ConnectionDragState | null>(null);
  readonly getNodeTitle = getNodeTitle;
  readonly getNodeHeadline = getNodeHeadline;
  readonly getNodeSummary = getNodeSummary;
  readonly isMultiPortNode = isMultiPortNode;
  readonly getNodeHeight = getNodeHeight;
  readonly getOutputPorts = getOutputPorts;
  readonly getOutputPortHandleTop = getOutputPortHandleTop;

  readonly canvasWidth = computed(() => {
    let maxWidth = this.minCanvasWidth;

    for (const node of this.store.flow().nodes) {
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

    for (const node of this.store.flow().nodes) {
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
  readonly edgePaths = computed(() => {
    const flow = this.store.flow();

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

    const sourceNode = findNode(this.store.flow(), connectionDrag.nodeId);

    if (!sourceNode) {
      return null;
    }

    const startPoint = this.getNodeOutputPoint(sourceNode, connectionDrag.portId);
    const targetNode =
      connectionDrag.hoveredTargetNodeId !== null
        ? findNode(this.store.flow(), connectionDrag.hoveredTargetNodeId)
        : undefined;
    const endPoint = targetNode
      ? this.getNodeInputPoint(targetNode)
      : connectionDrag.currentPosition;

    return buildEdgePath(startPoint.x, startPoint.y, endPoint.x, endPoint.y);
  });

  private dragState: DragState | null = null;

  private readonly syncInteractionState = effect(() => {
    const flow = this.store.flow();
    const pendingConnectionSource = this.pendingConnectionSource();
    const connectionDrag = this.connectionDrag();

    if (
      pendingConnectionSource &&
      !this.connectionSourceExists(
        flow,
        pendingConnectionSource.nodeId,
        pendingConnectionSource.portId
      )
    ) {
      this.pendingConnectionSource.set(null);
    }

    if (!connectionDrag) {
      return;
    }

    if (!this.connectionSourceExists(flow, connectionDrag.nodeId, connectionDrag.portId)) {
      this.connectionDrag.set(null);
      return;
    }

    if (
      connectionDrag.hoveredTargetNodeId &&
      !findNode(flow, connectionDrag.hoveredTargetNodeId)
    ) {
      this.connectionDrag.set({
        ...connectionDrag,
        hoveredTargetNodeId: null
      });
    }
  });

  clearCanvasSelection(): void {
    this.store.selectNode(null);
    this.cancelConnectionSelection(true);
  }

  removeSelectedNode(): void {
    const selectedNode = this.store.selectedNode();

    if (!selectedNode) {
      return;
    }

    this.store.removeSelectedNode();

    if (
      this.pendingConnectionSource()?.nodeId === selectedNode.id ||
      this.connectionDrag()?.nodeId === selectedNode.id ||
      this.connectionDrag()?.hoveredTargetNodeId === selectedNode.id
    ) {
      this.cancelConnectionSelection(false);
    }
  }

  beginNodeDrag(event: PointerLikeEvent, nodeId: string): void {
    const node = findNode(this.store.flow(), nodeId);

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

    this.store.selectNode(nodeId);
  }

  beginConnectionDrag(
    event: PointerLikeEvent,
    nodeId: string,
    portId: string | null = null
  ): void {
    const node = findNode(this.store.flow(), nodeId);

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
    this.store.selectNode(nodeId);
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerLikeEvent): void {
    if (
      this.dragState &&
      (event.pointerId ?? this.dragState.pointerId) === this.dragState.pointerId
    ) {
      this.store.updateNodePosition(
        this.dragState.nodeId,
        Math.max(this.dragState.originX + (event.clientX - this.dragState.startX), 24),
        Math.max(this.dragState.originY + (event.clientY - this.dragState.startY), 24)
      );
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
    this.store.setNotice('Connection drag cancelled.', 'info');
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
      this.store.setNotice('Connection source cleared.', 'info');
      return;
    }

    const node = findNode(this.store.flow(), nodeId);

    if (!node || !this.canStartConnection(node)) {
      this.store.setNotice('This node cannot start a new connection.', 'error');
      return;
    }

    this.pendingConnectionSource.set({
      nodeId,
      portId
    });
    this.store.selectNode(nodeId);
    this.store.setNotice(
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
      this.store.selectNode(nodeId);
      this.store.setNotice(
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

  getIssuesForNode(nodeId: string) {
    return this.store.getIssuesForNode(nodeId);
  }

  hasIssuesForNode(nodeId: string): boolean {
    return this.store.hasIssuesForNode(nodeId);
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

  isPortConnected(nodeId: string, portId: string): boolean {
    return this.store.isPortConnected(nodeId, portId);
  }

  getOutputHandleTestId(nodeId: string, portId: string | null = null): string {
    return portId ? `output-${nodeId}-${portId}` : `output-${nodeId}`;
  }

  private completeConnection(
    sourceNodeId: string,
    targetNodeId: string,
    sourcePortId: string | null
  ): void {
    this.store.connectNodes(sourceNodeId, targetNodeId, sourcePortId);
    this.connectionDrag.set(null);
    this.pendingConnectionSource.set(null);
  }

  private cancelConnectionSelection(showNotice: boolean): void {
    const hadSelection = !!this.pendingConnectionSource() || !!this.connectionDrag();
    this.pendingConnectionSource.set(null);
    this.connectionDrag.set(null);

    if (showNotice && hadSelection) {
      this.store.setNotice('Connection selection cleared.', 'info');
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
        y: node.position.y + this.getOutputPortHandleTop(node, sourcePortId) + 12
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

  private isNodeConnectionTarget(nodeId: string): boolean {
    const connectionDrag = this.connectionDrag();
    const node = findNode(this.store.flow(), nodeId);

    return !!connectionDrag && !!node && node.type !== 'start' && node.id !== connectionDrag.nodeId;
  }

  private connectionSourceExists(
    flow: FlowDefinition,
    nodeId: string,
    portId: string | null
  ): boolean {
    const node = findNode(flow, nodeId);

    if (!node) {
      return false;
    }

    if (portId === null) {
      return true;
    }

    if (!this.isMultiPortNode(node)) {
      return false;
    }

    return this.getOutputPorts(node).some((port) => port.id === portId);
  }
}
