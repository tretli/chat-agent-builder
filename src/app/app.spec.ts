import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { App } from './app';
import { FlowBuilderPageComponent } from './flow-builder/flow-builder-page.component';
import {
  FlowCanvasComponent
} from './flow-builder/components/flow-canvas.component';
import { FlowBuilderStore } from './flow-builder/flow-builder.store';
import {
  ConditionNode,
  DecisionNode,
  FlowDefinition,
  FlowNode
} from './flow-builder/flow-builder.models';
import { CONDITION_DEFAULT_PORT_ID } from './flow-builder/flow-builder.utils';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let host: HTMLElement;
  let page: FlowBuilderPageComponent;
  let canvas: FlowCanvasComponent;
  let store: FlowBuilderStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App]
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    host = fixture.nativeElement as HTMLElement;
    page = fixture.debugElement.query(By.directive(FlowBuilderPageComponent))
      .componentInstance as FlowBuilderPageComponent;
    canvas = fixture.debugElement.query(By.directive(FlowCanvasComponent))
      .componentInstance as FlowCanvasComponent;
    store = page.store;
    fixture.detectChanges();
  });

  it('renders the expanded builder shell', () => {
    expect(host.querySelector('h1')?.textContent).toContain(
      'Design how a conversation qualifies'
    );
    expect(getByTestId('add-start-node')).not.toBeNull();
    expect(getByTestId('add-send-message-node')).not.toBeNull();
    expect(getByTestId('add-ask-question-node')).not.toBeNull();
    expect(getByTestId('add-condition-node')).not.toBeNull();
    expect(getByTestId('add-fallback-node')).not.toBeNull();
    expect(getByTestId('add-handoff-node')).not.toBeNull();
    expect(getByTestId('add-end-node')).not.toBeNull();
    expect(getByTestId('empty-canvas')?.textContent).toContain('Start with a node');
  });

  it('adds each phase one node type and keeps the last node selected', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-send-message-node');
    clickByTestId('add-ask-question-node');
    clickByTestId('add-collect-node');
    clickByTestId('add-decision-node');
    clickByTestId('add-condition-node');
    clickByTestId('add-fallback-node');
    clickByTestId('add-route-node');
    clickByTestId('add-handoff-node');
    clickByTestId('add-end-node');

    expect(store.flow().nodes.map((node) => node.type)).toEqual([
      'start',
      'send-message',
      'ask-question',
      'collect-variable',
      'decision',
      'condition',
      'fallback',
      'route-to-queue',
      'human-handoff',
      'end-conversation'
    ]);
    expect(store.selectedNode()?.type).toBe('end-conversation');
    expect(host.querySelectorAll('.node-card').length).toBe(10);
  });

  it('updates send-message settings from the inspector', async () => {
    clickByTestId('add-send-message-node');

    const messageInput = getByTestId('send-message-input') as HTMLTextAreaElement;
    messageInput.value = 'Welcome to the team routing assistant.';
    messageInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const selectedNode = store.selectedNode();

    expect(selectedNode?.type).toBe('send-message');
    if (selectedNode?.type !== 'send-message') {
      throw new Error('Expected send-message node to stay selected.');
    }

    expect(selectedNode.config.message).toBe('Welcome to the team routing assistant.');
  });

  it('updates ask-question settings from the inspector', async () => {
    clickByTestId('add-ask-question-node');

    const promptInput = getByTestId('ask-prompt-input') as HTMLTextAreaElement;
    promptInput.value = 'Which team are you looking for today?';
    promptInput.dispatchEvent(new Event('input'));

    const responseKindSelect = getByTestId(
      'ask-response-kind-select'
    ) as HTMLSelectElement;
    responseKindSelect.value = 'single-choice';
    responseKindSelect.dispatchEvent(new Event('change'));

    await fixture.whenStable();
    fixture.detectChanges();

    const choiceInput = getByTestId('ask-choice-list-input') as HTMLTextAreaElement;
    choiceInput.value = 'Sales\nSupport\nBilling';
    choiceInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const selectedNode = store.selectedNode();

    expect(selectedNode?.type).toBe('ask-question');
    if (selectedNode?.type !== 'ask-question') {
      throw new Error('Expected ask-question node to stay selected.');
    }

    expect(selectedNode.config.prompt).toBe('Which team are you looking for today?');
    expect(selectedNode.config.responseKind).toBe('single-choice');
    expect(selectedNode.config.choices).toEqual(['Sales', 'Support', 'Billing']);
  });

  it('updates collect-variable settings from the inspector', async () => {
    clickByTestId('add-collect-node');

    const variableKeyInput = getByTestId('variable-key-input') as HTMLInputElement;
    variableKeyInput.value = 'leadCompany';
    variableKeyInput.dispatchEvent(new Event('input'));

    const promptInput = getByTestId('prompt-input') as HTMLTextAreaElement;
    promptInput.value = 'Which company are you contacting us from?';
    promptInput.dispatchEvent(new Event('input'));

    const requiredCheckbox = getByTestId('required-checkbox') as HTMLInputElement;
    requiredCheckbox.checked = false;
    requiredCheckbox.dispatchEvent(new Event('change'));

    await fixture.whenStable();
    fixture.detectChanges();

    const selectedNode = store.selectedNode();

    expect(selectedNode?.type).toBe('collect-variable');
    if (selectedNode?.type !== 'collect-variable') {
      throw new Error('Expected collect-variable node to stay selected.');
    }

    expect(selectedNode.config.variableKey).toBe('leadCompany');
    expect(selectedNode.config.prompt).toBe('Which company are you contacting us from?');
    expect(selectedNode.config.required).toBe(false);
  });

  it('updates decision settings and can add more exits from the inspector', async () => {
    clickByTestId('add-decision-node');

    const decisionNode = getSelectedDecisionNode();

    const promptInput = getByTestId('decision-prompt-input') as HTMLTextAreaElement;
    promptInput.value = 'Identify whether the user needs sales, onboarding, or billing help.';
    promptInput.dispatchEvent(new Event('input'));

    const [firstExit, secondExit] = decisionNode.config.exits;
    const firstExitInput = getByTestId(
      `decision-exit-input-${firstExit.id}`
    ) as HTMLInputElement;
    firstExitInput.value = 'Sales';
    firstExitInput.dispatchEvent(new Event('input'));

    const secondExitInput = getByTestId(
      `decision-exit-input-${secondExit.id}`
    ) as HTMLInputElement;
    secondExitInput.value = 'Onboarding';
    secondExitInput.dispatchEvent(new Event('input'));

    clickByTestId('add-decision-exit');

    await fixture.whenStable();
    fixture.detectChanges();

    const updatedNode = getSelectedDecisionNode();
    const thirdExit = updatedNode.config.exits[2];
    const thirdExitInput = getByTestId(
      `decision-exit-input-${thirdExit.id}`
    ) as HTMLInputElement;
    thirdExitInput.value = 'Billing';
    thirdExitInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const finalNode = getSelectedDecisionNode();

    expect(finalNode.config.intentPrompt).toBe(
      'Identify whether the user needs sales, onboarding, or billing help.'
    );
    expect(finalNode.config.exits.map((exit) => exit.label)).toEqual([
      'Sales',
      'Onboarding',
      'Billing'
    ]);
  });

  it('updates condition settings from the inspector', async () => {
    clickByTestId('add-condition-node');

    const conditionNode = getSelectedConditionNode();
    const firstRule = conditionNode.config.rules[0];

    const defaultLabelInput = getByTestId(
      'condition-default-label-input'
    ) as HTMLInputElement;
    defaultLabelInput.value = 'Otherwise';
    defaultLabelInput.dispatchEvent(new Event('input'));

    const ruleLabelInput = getByTestId(
      `condition-rule-label-${firstRule.id}`
    ) as HTMLInputElement;
    ruleLabelInput.value = 'Enterprise';
    ruleLabelInput.dispatchEvent(new Event('input'));

    const variableInput = getByTestId(
      `condition-rule-variable-${firstRule.id}`
    ) as HTMLInputElement;
    variableInput.value = 'plan';
    variableInput.dispatchEvent(new Event('input'));

    const operatorSelect = getByTestId(
      `condition-rule-operator-${firstRule.id}`
    ) as HTMLSelectElement;
    operatorSelect.value = 'equals';
    operatorSelect.dispatchEvent(new Event('change'));

    const valueInput = getByTestId(
      `condition-rule-value-${firstRule.id}`
    ) as HTMLInputElement;
    valueInput.value = 'enterprise';
    valueInput.dispatchEvent(new Event('input'));

    clickByTestId('add-condition-rule');

    await fixture.whenStable();
    fixture.detectChanges();

    const updatedNode = getSelectedConditionNode();
    const secondRule = updatedNode.config.rules[1];
    const secondRuleLabel = getByTestId(
      `condition-rule-label-${secondRule.id}`
    ) as HTMLInputElement;
    secondRuleLabel.value = 'Nordics';
    secondRuleLabel.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const finalNode = getSelectedConditionNode();

    expect(finalNode.config.defaultPortLabel).toBe('Otherwise');
    expect(finalNode.config.rules.map((rule) => rule.label)).toEqual([
      'Enterprise',
      'Nordics'
    ]);
    expect(finalNode.config.rules[0].variableKey).toBe('plan');
    expect(finalNode.config.rules[0].value).toBe('enterprise');
  });

  it('updates fallback, handoff, and end settings from the inspector', async () => {
    clickByTestId('add-fallback-node');

    const fallbackInput = getByTestId('fallback-message-input') as HTMLTextAreaElement;
    fallbackInput.value = 'I am not fully sure yet, so I will route you to a specialist.';
    fallbackInput.dispatchEvent(new Event('input'));

    clickByTestId('add-handoff-node');
    const handoffQueueSelect = getByTestId('handoff-queue-select') as HTMLSelectElement;
    handoffQueueSelect.value = 'support-general';
    handoffQueueSelect.dispatchEvent(new Event('change'));

    const handoffMessageInput = getByTestId(
      'handoff-transfer-message-input'
    ) as HTMLTextAreaElement;
    handoffMessageInput.value = 'Connecting you with a support specialist now.';
    handoffMessageInput.dispatchEvent(new Event('input'));

    clickByTestId('add-end-node');
    const endMessageInput = getByTestId('end-message-input') as HTMLTextAreaElement;
    endMessageInput.value = 'Thanks for reaching out today.';
    endMessageInput.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const fallbackNode = store.flow().nodes[0];
    const handoffNode = store.flow().nodes[1];
    const endNode = store.flow().nodes[2];

    if (fallbackNode.type !== 'fallback') {
      throw new Error('Expected fallback node.');
    }

    if (handoffNode.type !== 'human-handoff') {
      throw new Error('Expected human-handoff node.');
    }

    if (endNode.type !== 'end-conversation') {
      throw new Error('Expected end-conversation node.');
    }

    expect(fallbackNode.config.message).toContain('route you to a specialist');
    expect(handoffNode.config.queueId).toBe('support-general');
    expect(handoffNode.config.transferMessage).toContain('support specialist');
    expect(endNode.config.closingMessage).toBe('Thanks for reaching out today.');
  });

  it('updates node position while dragging and does not start a connection drag', () => {
    clickByTestId('add-start-node');

    const node = store.flow().nodes[0];

    canvas.beginNodeDrag(createPointerEvent(120, 120, 1), node.id);
    canvas.onWindowPointerMove(createPointerEvent(260, 300, 1));
    canvas.onWindowPointerUp(createPointerEvent(260, 300, 1));
    fixture.detectChanges();

    const updatedNode = store.flow().nodes[0];
    expect(updatedNode.position).toEqual({
      x: 236,
      y: 268
    });
    expect(canvas.connectionDrag()).toBeNull();
    expect(store.flow().edges.length).toBe(0);
  });

  it('keeps click-to-connect as a fallback', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-send-message-node');
    clickByTestId('add-route-node');

    const [startNode, sendNode, routeNode] = store.flow().nodes;

    clickByTestId(`output-${startNode.id}`);
    clickByTestId(`input-${sendNode.id}`);

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: startNode.id,
        targetNodeId: sendNode.id
      }
    ]);

    clickByTestId(`output-${startNode.id}`);
    clickByTestId(`input-${routeNode.id}`);

    expect(store.flow().edges.length).toBe(1);
    expect(store.flow().edges[0]).toEqual({
      id: 'edge-1',
      sourceNodeId: startNode.id,
      targetNodeId: routeNode.id
    });
    expect(store.notice().text).toContain('rewired');
  });

  it('connects condition rules and the no-match port', () => {
    clickByTestId('add-condition-node');
    clickByTestId('add-route-node');
    clickByTestId('add-fallback-node');

    const [conditionNode, routeNode, fallbackNode] = store.flow().nodes;
    const ruleNode = asConditionNode(conditionNode);
    const firstRule = ruleNode.config.rules[0];

    clickByTestId(`output-${ruleNode.id}-${firstRule.id}`);
    clickByTestId(`input-${routeNode.id}`);
    clickByTestId(`output-${ruleNode.id}-${CONDITION_DEFAULT_PORT_ID}`);
    clickByTestId(`input-${fallbackNode.id}`);

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: ruleNode.id,
        targetNodeId: routeNode.id,
        sourcePortId: firstRule.id
      },
      {
        id: 'edge-2',
        sourceNodeId: ruleNode.id,
        targetNodeId: fallbackNode.id,
        sourcePortId: CONDITION_DEFAULT_PORT_ID
      }
    ]);
  });

  it('allows multiple branches into shared terminal targets', () => {
    clickByTestId('add-decision-node');
    clickByTestId('add-route-node');

    const [decisionNode, routeNode] = store.flow().nodes;
    const branchNode = asDecisionNode(decisionNode);

    clickByTestId(`output-${branchNode.id}-${branchNode.config.exits[0].id}`);
    clickByTestId(`input-${routeNode.id}`);
    clickByTestId(`output-${branchNode.id}-${branchNode.config.exits[1].id}`);
    clickByTestId(`input-${routeNode.id}`);

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: branchNode.id,
        targetNodeId: routeNode.id,
        sourcePortId: branchNode.config.exits[0].id
      },
      {
        id: 'edge-2',
        sourceNodeId: branchNode.id,
        targetNodeId: routeNode.id,
        sourcePortId: branchNode.config.exits[1].id
      }
    ]);
  });

  it('still rejects a second incoming edge on ordinary nodes', () => {
    clickByTestId('add-decision-node');
    clickByTestId('add-collect-node');

    const [decisionNode, collectNode] = store.flow().nodes;
    const branchNode = asDecisionNode(decisionNode);

    clickByTestId(`output-${branchNode.id}-${branchNode.config.exits[0].id}`);
    clickByTestId(`input-${collectNode.id}`);
    clickByTestId(`output-${branchNode.id}-${branchNode.config.exits[1].id}`);
    clickByTestId(`input-${collectNode.id}`);

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: branchNode.id,
        targetNodeId: collectNode.id,
        sourcePortId: branchNode.config.exits[0].id
      }
    ]);
    expect(store.notice().text).toContain('incoming connection');
  });

  it('creates a connection by dragging from a condition port to a shared fallback node', () => {
    clickByTestId('add-condition-node');
    clickByTestId('add-fallback-node');

    const [conditionNode, fallbackNode] = store.flow().nodes;
    const ruleNode = asConditionNode(conditionNode);

    canvas.beginConnectionDrag(
      createPointerEvent(110, 110, 7),
      ruleNode.id,
      CONDITION_DEFAULT_PORT_ID
    );
    canvas.onWindowPointerMove(createPointerEvent(220, 240, 7));
    fixture.detectChanges();

    expect(canvas.previewEdgePath()).not.toBeNull();
    expect(getByTestId('preview-edge')).not.toBeNull();

    canvas.handleNodeConnectionPointerEnter(fallbackNode.id);
    canvas.handleNodeConnectionPointerUp(fallbackNode.id, createPointerEvent(220, 240, 7));
    fixture.detectChanges();

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: ruleNode.id,
        targetNodeId: fallbackNode.id,
        sourcePortId: CONDITION_DEFAULT_PORT_ID
      }
    ]);
  });

  it('does not render a start input handle or terminal output handles', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-route-node');
    clickByTestId('add-handoff-node');
    clickByTestId('add-end-node');

    const [startNode, routeNode, handoffNode, endNode] = store.flow().nodes;

    expect(getByTestId(`input-${startNode.id}`)).toBeNull();
    expect(getByTestId(`output-${routeNode.id}`)).toBeNull();
    expect(getByTestId(`output-${handoffNode.id}`)).toBeNull();
    expect(getByTestId(`output-${endNode.id}`)).toBeNull();
  });

  it('surfaces validation issues for incomplete phase one nodes and keeps end message optional', () => {
    store.flow.set(createFlowWithPhaseOneValidationProblems());
    store.selectNode('condition-1');
    fixture.detectChanges();

    const issueCodes = store.validationIssues().map((issue) => issue.code);

    expect(issueCodes).toContain('missing-send-message');
    expect(issueCodes).toContain('missing-question-prompt');
    expect(issueCodes).toContain('missing-question-choices');
    expect(issueCodes).toContain('missing-condition-variable');
    expect(issueCodes).toContain('unconnected-condition-default');
    expect(issueCodes).toContain('missing-fallback-message');
    expect(issueCodes).toContain('missing-handoff-queue');
    expect(issueCodes).not.toContain('missing-end-message');
  });

  it('renders the live JSON preview with sourcePortId', () => {
    clickByTestId('add-condition-node');
    clickByTestId('add-route-node');
    clickByTestId('add-fallback-node');

    const [conditionNode] = store.flow().nodes;
    const ruleNode = asConditionNode(conditionNode);
    const firstRule = ruleNode.config.rules[0];

    clickByTestId(`output-${ruleNode.id}-${firstRule.id}`);
    clickByTestId('input-node-2');
    clickByTestId(`output-${ruleNode.id}-${CONDITION_DEFAULT_PORT_ID}`);
    clickByTestId('input-node-3');

    const jsonPreview = getByTestId('json-preview')?.textContent ?? '';

    expect(jsonPreview).toContain('"type": "condition"');
    expect(jsonPreview).toContain('"type": "fallback"');
    expect(jsonPreview).toContain('"sourcePortId"');
  });

  function getByTestId(testId: string): HTMLElement | null {
    return host.querySelector(`[data-testid="${testId}"]`);
  }

  function clickByTestId(testId: string): void {
    const element = getByTestId(testId);

    if (!element) {
      throw new Error(`Missing element with data-testid="${testId}"`);
    }

    (element as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  function getSelectedDecisionNode(): DecisionNode {
    return asDecisionNode(store.selectedNode());
  }

  function getSelectedConditionNode(): ConditionNode {
    return asConditionNode(store.selectedNode());
  }
});

function createFlowWithPhaseOneValidationProblems(): FlowDefinition {
  return {
    nodes: [
      {
        id: 'start-1',
        type: 'start',
        position: { x: 96, y: 88 },
        config: {}
      },
      {
        id: 'send-1',
        type: 'send-message',
        position: { x: 416, y: 88 },
        config: {
          message: ''
        }
      },
      {
        id: 'ask-1',
        type: 'ask-question',
        position: { x: 736, y: 88 },
        config: {
          prompt: '',
          responseKind: 'single-choice',
          choices: []
        }
      },
      {
        id: 'condition-1',
        type: 'condition',
        position: { x: 416, y: 308 },
        config: {
          defaultPortLabel: '',
          rules: [
            {
              id: 'condition-rule-1',
              label: 'Enterprise',
              variableKey: '',
              operator: 'equals',
              value: ''
            }
          ]
        }
      },
      {
        id: 'fallback-1',
        type: 'fallback',
        position: { x: 736, y: 308 },
        config: {
          message: ''
        }
      },
      {
        id: 'handoff-1',
        type: 'human-handoff',
        position: { x: 1056, y: 308 },
        config: {
          queueId: '',
          queueName: '',
          transferMessage: ''
        }
      },
      {
        id: 'end-1',
        type: 'end-conversation',
        position: { x: 1056, y: 88 },
        config: {
          closingMessage: ''
        }
      }
    ],
    edges: [
      {
        id: 'edge-1',
        sourceNodeId: 'start-1',
        targetNodeId: 'send-1'
      }
    ]
  };
}

function createPointerEvent(
  clientX: number,
  clientY: number,
  pointerId: number
): {
  clientX: number;
  clientY: number;
  pointerId: number;
  preventDefault: () => void;
  stopPropagation: () => void;
} {
  return {
    clientX,
    clientY,
    pointerId,
    preventDefault: () => undefined,
    stopPropagation: () => undefined
  };
}

function asDecisionNode(node: FlowNode | null | undefined): DecisionNode {
  if (!node || node.type !== 'decision') {
    throw new Error('Expected decision node.');
  }

  return node;
}

function asConditionNode(node: FlowNode | null | undefined): ConditionNode {
  if (!node || node.type !== 'condition') {
    throw new Error('Expected condition node.');
  }

  return node;
}
