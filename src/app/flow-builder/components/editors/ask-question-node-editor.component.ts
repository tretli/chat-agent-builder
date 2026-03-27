import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getAskChoiceText } from '../../flow-builder-display.utils';
import { AskQuestionNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-ask-question-node-editor',
  imports: [FormsModule],
  templateUrl: './ask-question-node-editor.component.html'
})
export class AskQuestionNodeEditorComponent {
  readonly node = input.required<AskQuestionNode>();
  readonly store = inject(FlowBuilderStore);
  readonly getAskChoiceText = getAskChoiceText;
}
