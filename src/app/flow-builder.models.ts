export type FlowNodeType =
  | 'start'
  | 'collect-variable'
  | 'decision'
  | 'route-to-queue';

export interface NodePosition {
  x: number;
  y: number;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceExitId?: string;
}

interface BaseFlowNode<TType extends FlowNodeType, TConfig> {
  id: string;
  type: TType;
  position: NodePosition;
  config: TConfig;
}

export interface StartNode extends BaseFlowNode<'start', Record<string, never>> {}

export interface CollectVariableNode
  extends BaseFlowNode<
    'collect-variable',
    {
      variableKey: string;
      prompt: string;
      required: boolean;
    }
  > {}

export interface DecisionExit {
  id: string;
  label: string;
}

export interface DecisionNode
  extends BaseFlowNode<
    'decision',
    {
      intentPrompt: string;
      exits: DecisionExit[];
    }
  > {}

export interface RouteToQueueNode
  extends BaseFlowNode<
    'route-to-queue',
    {
      queueId: string;
      queueName: string;
    }
  > {}

export type FlowNode = StartNode | CollectVariableNode | DecisionNode | RouteToQueueNode;

export interface QueueOption {
  id: string;
  name: string;
  description: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
}
