import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CollectVariableNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-collect-variable-node-editor',
  imports: [FormsModule],
  templateUrl: './collect-variable-node-editor.component.html'
})
export class CollectVariableNodeEditorComponent {
  readonly node = input.required<CollectVariableNode>();
  readonly store = inject(FlowBuilderStore);
}
