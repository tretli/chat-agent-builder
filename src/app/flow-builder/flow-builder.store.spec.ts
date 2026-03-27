import { FlowBuilderStore } from './flow-builder.store';
import { CONDITION_DEFAULT_PORT_ID } from './flow-builder.utils';

describe('FlowBuilderStore', () => {
  let store: FlowBuilderStore;

  beforeEach(() => {
    store = new FlowBuilderStore();
  });

  it('adds nodes and keeps the latest node selected', () => {
    store.addNode('start');
    store.addNode('send-message');

    expect(store.flow().nodes.map((node) => node.type)).toEqual(['start', 'send-message']);
    expect(store.selectedNode()?.type).toBe('send-message');
  });

  it('rewires an existing single-output connection', () => {
    store.addNode('start');
    store.addNode('send-message');
    store.addNode('route-to-queue');

    const [startNode, sendNode, routeNode] = store.flow().nodes;

    store.connectNodes(startNode.id, sendNode.id, null);
    store.connectNodes(startNode.id, routeNode.id, null);

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: startNode.id,
        targetNodeId: routeNode.id
      }
    ]);
    expect(store.notice().text).toContain('rewired');
  });

  it('rejects a second incoming edge on ordinary nodes', () => {
    store.addNode('decision');
    store.addNode('collect-variable');

    const [decisionNode, collectNode] = store.flow().nodes;

    if (decisionNode.type !== 'decision') {
      throw new Error('Expected decision node.');
    }

    store.connectNodes(decisionNode.id, collectNode.id, decisionNode.config.exits[0].id);
    const result = store.connectNodes(
      decisionNode.id,
      collectNode.id,
      decisionNode.config.exits[1].id
    );

    expect(result).toEqual({ ok: false });
    expect(store.notice().text).toContain('incoming connection');
  });

  it('allows multiple branches into shared terminal targets', () => {
    store.addNode('condition');
    store.addNode('route-to-queue');

    const [conditionNode, routeNode] = store.flow().nodes;

    if (conditionNode.type !== 'condition') {
      throw new Error('Expected condition node.');
    }

    store.connectNodes(conditionNode.id, routeNode.id, conditionNode.config.rules[0].id);
    store.connectNodes(conditionNode.id, routeNode.id, CONDITION_DEFAULT_PORT_ID);

    expect(store.flow().edges).toEqual([
      {
        id: 'edge-1',
        sourceNodeId: conditionNode.id,
        targetNodeId: routeNode.id,
        sourcePortId: conditionNode.config.rules[0].id
      },
      {
        id: 'edge-2',
        sourceNodeId: conditionNode.id,
        targetNodeId: routeNode.id,
        sourcePortId: CONDITION_DEFAULT_PORT_ID
      }
    ]);
  });
});
