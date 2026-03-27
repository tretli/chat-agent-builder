import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EndConversationNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-end-conversation-node-editor',
  imports: [FormsModule],
  templateUrl: './end-conversation-node-editor.component.html'
})
export class EndConversationNodeEditorComponent {
  readonly node = input.required<EndConversationNode>();
  readonly store = inject(FlowBuilderStore);
}
