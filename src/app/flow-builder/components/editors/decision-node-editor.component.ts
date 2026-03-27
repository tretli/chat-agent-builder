import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { canRemoveDecisionExit } from '../../flow-builder-display.utils';
import { DecisionNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-decision-node-editor',
  imports: [FormsModule],
  templateUrl: './decision-node-editor.component.html'
})
export class DecisionNodeEditorComponent {
  readonly node = input.required<DecisionNode>();
  readonly store = inject(FlowBuilderStore);
  readonly canRemoveDecisionExit = canRemoveDecisionExit;
}
