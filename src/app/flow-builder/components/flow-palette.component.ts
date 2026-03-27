import { Component, inject } from '@angular/core';
import { FlowBuilderStore } from '../flow-builder.store';

@Component({
  selector: 'app-flow-palette',
  templateUrl: './flow-palette.component.html',
  styleUrl: './flow-palette.component.css'
})
export class FlowPaletteComponent {
  readonly store = inject(FlowBuilderStore);
}
