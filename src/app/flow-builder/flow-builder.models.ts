export type FlowNodeType =
  | 'start'
  | 'send-message'
  | 'ask-question'
  | 'collect-variable'
  | 'decision'
  | 'condition'
  | 'fallback'
  | 'route-to-queue'
  | 'human-handoff'
  | 'end-conversation'
  | 'set-variable'
  | 'api-lookup'
  | 'knowledge-answer';

export type QuestionResponseKind = 'short-text' | 'long-text' | 'single-choice';
export type ConditionOperator =
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'greater-than'
  | 'less-than'
  | 'is-empty'
  | 'is-not-empty';
export type SetVariableSourceType = 'static' | 'variable' | 'template';
export type ApiLookupMethod = 'GET' | 'POST';

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
  sourcePortId?: string;
}

interface BaseFlowNode<TType extends FlowNodeType, TConfig> {
  id: string;
  type: TType;
  position: NodePosition;
  config: TConfig;
}

export interface NodePort {
  id: string;
  label: string;
}

export interface ConditionRule {
  id: string;
  label: string;
  variableKey: string;
  operator: ConditionOperator;
  value: string;
}

export interface MappingRow {
  id: string;
  sourceKey: string;
  targetKey: string;
}

export interface StartNode extends BaseFlowNode<'start', Record<string, never>> {}

export interface SendMessageNode
  extends BaseFlowNode<
    'send-message',
    {
      message: string;
    }
  > {}

export interface AskQuestionNode
  extends BaseFlowNode<
    'ask-question',
    {
      prompt: string;
      responseKind: QuestionResponseKind;
      choices: string[];
    }
  > {}

export interface CollectVariableNode
  extends BaseFlowNode<
    'collect-variable',
    {
      variableKey: string;
      prompt: string;
      required: boolean;
    }
  > {}

export interface DecisionNode
  extends BaseFlowNode<
    'decision',
    {
      intentPrompt: string;
      exits: NodePort[];
    }
  > {}

export interface ConditionNode
  extends BaseFlowNode<
    'condition',
    {
      rules: ConditionRule[];
      defaultPortLabel: string;
    }
  > {}

export interface FallbackNode
  extends BaseFlowNode<
    'fallback',
    {
      message: string;
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

export interface HumanHandoffNode
  extends BaseFlowNode<
    'human-handoff',
    {
      queueId: string;
      queueName: string;
      transferMessage: string;
    }
  > {}

export interface EndConversationNode
  extends BaseFlowNode<
    'end-conversation',
    {
      closingMessage: string;
    }
  > {}

export interface SetVariableNode
  extends BaseFlowNode<
    'set-variable',
    {
      targetVariableKey: string;
      sourceType: SetVariableSourceType;
      staticValue: string;
      sourceVariableKey: string;
      template: string;
    }
  > {}

export interface ApiLookupNode
  extends BaseFlowNode<
    'api-lookup',
    {
      lookupName: string;
      method: ApiLookupMethod;
      endpointLabel: string;
      requestMappings: MappingRow[];
      responseMappings: MappingRow[];
    }
  > {}

export interface KnowledgeAnswerNode
  extends BaseFlowNode<
    'knowledge-answer',
    {
      knowledgeSourceId: string;
      knowledgeSourceName: string;
      answerInstructions: string;
    }
  > {}

export type FlowNode =
  | StartNode
  | SendMessageNode
  | AskQuestionNode
  | CollectVariableNode
  | DecisionNode
  | ConditionNode
  | FallbackNode
  | RouteToQueueNode
  | HumanHandoffNode
  | EndConversationNode
  | SetVariableNode
  | ApiLookupNode
  | KnowledgeAnswerNode;

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
