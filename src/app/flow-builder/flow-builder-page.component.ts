import { Component, ViewEncapsulation, inject } from '@angular/core';
import { FlowBuilderStore } from './flow-builder.store';
import { FlowCanvasComponent } from './components/flow-canvas.component';
import { FlowDiagnosticsComponent } from './components/flow-diagnostics.component';
import { FlowInspectorComponent } from './components/flow-inspector.component';
import { FlowPaletteComponent } from './components/flow-palette.component';

@Component({
  selector: 'app-flow-builder-page',
  imports: [
    FlowPaletteComponent,
    FlowCanvasComponent,
    FlowInspectorComponent,
    FlowDiagnosticsComponent
  ],
  providers: [FlowBuilderStore],
  templateUrl: './flow-builder-page.component.html',
  styleUrl: './flow-builder-page.component.css',
  encapsulation: ViewEncapsulation.None
})
export class FlowBuilderPageComponent {
  readonly store = inject(FlowBuilderStore);
}
