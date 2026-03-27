import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SendMessageNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-send-message-node-editor',
  imports: [FormsModule],
  templateUrl: './send-message-node-editor.component.html'
})
export class SendMessageNodeEditorComponent {
  readonly node = input.required<SendMessageNode>();
  readonly store = inject(FlowBuilderStore);
}
