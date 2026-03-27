import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getQueueDescription } from '../../flow-builder-display.utils';
import { HumanHandoffNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-human-handoff-node-editor',
  imports: [FormsModule],
  templateUrl: './human-handoff-node-editor.component.html'
})
export class HumanHandoffNodeEditorComponent {
  readonly node = input.required<HumanHandoffNode>();
  readonly store = inject(FlowBuilderStore);
  readonly getQueueDescription = getQueueDescription;
}
