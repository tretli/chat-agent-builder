import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FallbackNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-fallback-node-editor',
  imports: [FormsModule],
  templateUrl: './fallback-node-editor.component.html'
})
export class FallbackNodeEditorComponent {
  readonly node = input.required<FallbackNode>();
  readonly store = inject(FlowBuilderStore);
}
