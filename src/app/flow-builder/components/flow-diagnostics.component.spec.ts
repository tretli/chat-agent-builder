import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FlowBuilderStore } from '../flow-builder.store';
import { FlowDiagnosticsComponent } from './flow-diagnostics.component';

describe('FlowDiagnosticsComponent', () => {
  let fixture: ComponentFixture<FlowDiagnosticsComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowDiagnosticsComponent],
      providers: [FlowBuilderStore]
    }).compileComponents();

    fixture = TestBed.createComponent(FlowDiagnosticsComponent);
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders validation issues and the json preview', () => {
    expect(host.querySelector('[data-testid="validation-list"]')?.textContent).toContain(
      'Add a start node'
    );
    expect(host.querySelector('[data-testid="json-preview"]')?.textContent).toContain(
      '"nodes": []'
    );
  });
});
