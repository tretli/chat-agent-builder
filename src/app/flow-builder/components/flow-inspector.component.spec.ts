import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowBuilderStore } from '../flow-builder.store';
import { FlowInspectorComponent } from './flow-inspector.component';

describe('FlowInspectorComponent', () => {
  let fixture: ComponentFixture<FlowInspectorComponent>;
  let host: HTMLElement;
  let store: FlowBuilderStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowInspectorComponent],
      providers: [FlowBuilderStore]
    }).compileComponents();

    fixture = TestBed.createComponent(FlowInspectorComponent);
    host = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(FlowBuilderStore);
    store.addNode('send-message');
    fixture.detectChanges();
  });

  it('renders the correct editor for the selected node and updates the store', async () => {
    const input = host.querySelector('[data-testid="send-message-input"]') as HTMLTextAreaElement;

    expect(input).not.toBeNull();

    input.value = 'Welcome aboard.';
    input.dispatchEvent(new Event('input'));

    await fixture.whenStable();
    fixture.detectChanges();

    const selectedNode = store.selectedNode();

    expect(selectedNode?.type).toBe('send-message');
    if (selectedNode?.type !== 'send-message') {
      throw new Error('Expected send-message node.');
    }

    expect(selectedNode.config.message).toBe('Welcome aboard.');
  });
});
