import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { requiresConditionValue } from '../../flow-builder-display.utils';
import { ConditionNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-condition-node-editor',
  imports: [FormsModule],
  templateUrl: './condition-node-editor.component.html'
})
export class ConditionNodeEditorComponent {
  readonly node = input.required<ConditionNode>();
  readonly store = inject(FlowBuilderStore);
  readonly requiresConditionValue = requiresConditionValue;
}
