import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { FlowDefinition } from './flow-builder.models';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let app: App;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App]
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    app = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the flow builder shell', () => {
    expect(host.querySelector('h1')?.textContent).toContain(
      'Design how a conversation qualifies'
    );
    expect(getByTestId('add-start-node')).not.toBeNull();
    expect(getByTestId('empty-canvas')?.textContent).toContain('Start with a node');
  });

  it('adds each node type and keeps the last node selected', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-collect-node');
    clickByTestId('add-route-node');

    expect(app.flow().nodes.map((node) => node.type)).toEqual([
      'start',
      'collect-variable',
      'route-to-queue'
    ]);
    expect(app.selectedNode()?.type).toBe('route-to-queue');
    expect(host.querySelectorAll('.node-card').length).toBe(3);
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

    const selectedNode = app.selectedNode();

    expect(selectedNode?.type).toBe('collect-variable');
    if (selectedNode?.type !== 'collect-variable') {
      throw new Error('Expected collect-variable node to stay selected.');
    }

    expect(selectedNode.config.variableKey).toBe('leadCompany');
    expect(selectedNode.config.prompt).toBe('Which company are you contacting us from?');
    expect(selectedNode.config.required).toBe(false);
  });

  it('updates the selected route queue from the inspector', async () => {
    clickByTestId('add-route-node');

    const queueSelect = getByTestId('queue-select') as HTMLSelectElement;
    queueSelect.value = 'sales-priority';
    queueSelect.dispatchEvent(new Event('change'));

    await fixture.whenStable();
    fixture.detectChanges();

    const selectedNode = app.selectedNode();

    expect(selectedNode?.type).toBe('route-to-queue');
    if (selectedNode?.type !== 'route-to-queue') {
      throw new Error('Expected route node to stay selected.');
    }

    expect(selectedNode.config.queueId).toBe('sales-priority');
    expect(selectedNode.config.queueName).toBe('Sales Priority');
    expect(host.textContent).toContain('High-intent conversations');
  });

  it('updates node position while dragging and does not start a connection drag', () => {
    clickByTestId('add-start-node');

    const node = app.flow().nodes[0];

    app.beginNodeDrag(createPointerEvent(120, 120, 1), node.id);
    app.onWindowPointerMove(createPointerEvent(260, 300, 1));
    app.onWindowPointerUp(createPointerEvent(260, 300, 1));
    fixture.detectChanges();

    const updatedNode = app.flow().nodes[0];
    expect(updatedNode.position).toEqual({
      x: 236,
      y: 268
    });
    expect(app.connectionDrag()).toBeNull();
    expect(app.flow().edges.length).toBe(0);
  });

  it('keeps click-to-connect as a fallback', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-collect-node');
    clickByTestId('add-route-node');

    const [startNode, collectNode, routeNode] = app.flow().nodes;

    clickByTestId(`output-${startNode.id}`);
    clickByTestId(`input-${collectNode.id}`);

    expect(app.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: startNode.id,
        targetNodeId: collectNode.id
      }
    ]);

    clickByTestId(`output-${startNode.id}`);
    clickByTestId(`input-${routeNode.id}`);

    expect(app.flow().edges.length).toBe(1);
    expect(app.notice().text).toContain('already has an outgoing connection');
  });

  it('creates a connection by dragging from the output handle to the target node card', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-collect-node');

    const [startNode, collectNode] = app.flow().nodes;

    app.beginConnectionDrag(createPointerEvent(110, 110, 7), startNode.id);
    app.onWindowPointerMove(createPointerEvent(220, 240, 7));
    fixture.detectChanges();

    expect(app.previewEdgePath()).not.toBeNull();
    expect(getByTestId('preview-edge')).not.toBeNull();

    app.handleNodeConnectionPointerEnter(collectNode.id);
    app.handleNodeConnectionPointerUp(collectNode.id, createPointerEvent(220, 240, 7));
    fixture.detectChanges();

    expect(app.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: startNode.id,
        targetNodeId: collectNode.id
      }
    ]);
    expect(app.edgePaths()[0]?.path).toBe('M 344 166 C 380 166, 380 166, 416 166');
    expect(app.connectionDrag()).toBeNull();
    expect(app.notice().text).toContain('Nodes connected');
  });

  it('cancels a dragged connection when released away from a valid target', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-collect-node');

    const startNode = app.flow().nodes[0];

    app.beginConnectionDrag(createPointerEvent(110, 110, 8), startNode.id);
    app.onWindowPointerMove(createPointerEvent(380, 420, 8));
    app.onWindowPointerUp(createPointerEvent(380, 420, 8));
    fixture.detectChanges();

    expect(app.flow().edges.length).toBe(0);
    expect(app.connectionDrag()).toBeNull();
    expect(app.notice().text).toContain('Connection drag cancelled');
  });

  it('rejects invalid dragged connections and leaves the flow unchanged', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-collect-node');
    clickByTestId('add-route-node');

    const [startNode, collectNode, routeNode] = app.flow().nodes;

    clickByTestId(`output-${startNode.id}`);
    clickByTestId(`input-${collectNode.id}`);
    expect(app.flow().edges.length).toBe(1);

    app.beginConnectionDrag(createPointerEvent(110, 110, 9), startNode.id);
    app.onWindowPointerMove(createPointerEvent(420, 260, 9));
    app.handleNodeConnectionPointerEnter(routeNode.id);
    app.handleNodeConnectionPointerUp(routeNode.id, createPointerEvent(420, 260, 9));
    fixture.detectChanges();

    expect(app.flow().edges.length).toBe(1);
    expect(app.connectionDrag()).toBeNull();
    expect(app.notice().text).toContain('already has an outgoing connection');
  });

  it('does not render a start input handle or a route output handle', () => {
    clickByTestId('add-start-node');
    clickByTestId('add-route-node');

    const [startNode, routeNode] = app.flow().nodes;

    expect(getByTestId(`input-${startNode.id}`)).toBeNull();
    expect(getByTestId(`output-${routeNode.id}`)).toBeNull();
  });

  it('surfaces a missing route validation issue when no route node exists', () => {
    app.flow.set({
      nodes: [
        {
          id: 'start-1',
          type: 'start',
          position: { x: 96, y: 88 },
          config: {}
        }
      ],
      edges: []
    });
    fixture.detectChanges();

    expect(app.validationIssues().map((issue) => issue.code)).toContain('missing-route');
  });

  it('surfaces validation issues for duplicates, queue selection, and disconnected nodes', () => {
    app.flow.set(createFlowWithValidationProblems());
    app.selectNode('collect-1');
    fixture.detectChanges();

    const issueCodes = app.validationIssues().map((issue) => issue.code);

    expect(issueCodes).toContain('duplicate-variable-key');
    expect(issueCodes).toContain('missing-prompt');
    expect(issueCodes).toContain('missing-queue');
    expect(issueCodes).toContain('disconnected-node');
    expect(getByTestId('validation-list')?.textContent).toContain(
      'Variable keys must be unique'
    );
  });

  it('renders the live JSON preview from the current flow state', async () => {
    clickByTestId('add-start-node');
    clickByTestId('add-route-node');

    const queueSelect = getByTestId('queue-select') as HTMLSelectElement;
    queueSelect.value = 'support-general';
    queueSelect.dispatchEvent(new Event('change'));

    await fixture.whenStable();
    fixture.detectChanges();

    const jsonPreview = getByTestId('json-preview')?.textContent ?? '';

    expect(jsonPreview).toContain('"type": "start"');
    expect(jsonPreview).toContain('"type": "route-to-queue"');
    expect(jsonPreview).toContain('"queueId": "support-general"');
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
});

function createFlowWithValidationProblems(): FlowDefinition {
  return {
    nodes: [
      {
        id: 'start-1',
        type: 'start',
        position: { x: 96, y: 88 },
        config: {}
      },
      {
        id: 'collect-1',
        type: 'collect-variable',
        position: { x: 416, y: 88 },
        config: {
          variableKey: 'company',
          prompt: '',
          required: true
        }
      },
      {
        id: 'collect-2',
        type: 'collect-variable',
        position: { x: 736, y: 88 },
        config: {
          variableKey: 'company',
          prompt: 'How many seats do you need?',
          required: true
        }
      },
      {
        id: 'route-1',
        type: 'route-to-queue',
        position: { x: 736, y: 308 },
        config: {
          queueId: '',
          queueName: ''
        }
      }
    ],
    edges: [
      {
        id: 'edge-1',
        sourceNodeId: 'start-1',
        targetNodeId: 'collect-1'
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
