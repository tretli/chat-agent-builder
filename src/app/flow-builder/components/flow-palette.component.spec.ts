import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowBuilderStore } from '../flow-builder.store';
import { FlowPaletteComponent } from './flow-palette.component';

describe('FlowPaletteComponent', () => {
  let fixture: ComponentFixture<FlowPaletteComponent>;
  let host: HTMLElement;
  let store: FlowBuilderStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowPaletteComponent],
      providers: [FlowBuilderStore]
    }).compileComponents();

    fixture = TestBed.createComponent(FlowPaletteComponent);
    host = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(FlowBuilderStore);
    fixture.detectChanges();
  });

  it('adds a node from the palette', () => {
    (host.querySelector('[data-testid="add-send-message-node"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(store.flow().nodes.map((node) => node.type)).toEqual(['send-message']);
  });
});
