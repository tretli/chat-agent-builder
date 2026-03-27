import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowBuilderStore } from '../flow-builder.store';
import { FlowCanvasComponent } from './flow-canvas.component';

describe('FlowCanvasComponent', () => {
  let fixture: ComponentFixture<FlowCanvasComponent>;
  let component: FlowCanvasComponent;
  let host: HTMLElement;
  let store: FlowBuilderStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowCanvasComponent],
      providers: [FlowBuilderStore]
    }).compileComponents();

    fixture = TestBed.createComponent(FlowCanvasComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(FlowBuilderStore);
    store.addNode('start');
    fixture.detectChanges();
  });

  it('renders nodes and updates node position while dragging', () => {
    const node = store.flow().nodes[0];

    expect(host.querySelector(`[data-testid="node-${node.id}"]`)).not.toBeNull();

    component.beginNodeDrag(createPointerEvent(120, 120, 1), node.id);
    component.onWindowPointerMove(createPointerEvent(220, 260, 1));
    component.onWindowPointerUp(createPointerEvent(220, 260, 1));
    fixture.detectChanges();

    expect(store.flow().nodes[0].position).toEqual({
      x: 196,
      y: 228
    });
  });
});

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
