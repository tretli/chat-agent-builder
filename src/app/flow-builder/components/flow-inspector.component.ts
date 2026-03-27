import { Component, inject } from '@angular/core';
import { getNodeHeadline, getNodeSummary } from '../flow-builder-display.utils';
import { FlowBuilderStore } from '../flow-builder.store';
import { getNodeTitle } from '../flow-builder.utils';
import { AskQuestionNodeEditorComponent } from './editors/ask-question-node-editor.component';
import { CollectVariableNodeEditorComponent } from './editors/collect-variable-node-editor.component';
import { ConditionNodeEditorComponent } from './editors/condition-node-editor.component';
import { DecisionNodeEditorComponent } from './editors/decision-node-editor.component';
import { EndConversationNodeEditorComponent } from './editors/end-conversation-node-editor.component';
import { FallbackNodeEditorComponent } from './editors/fallback-node-editor.component';
import { HumanHandoffNodeEditorComponent } from './editors/human-handoff-node-editor.component';
import { PhaseTwoPlaceholderEditorComponent } from './editors/phase-two-placeholder-editor.component';
import { RouteToQueueNodeEditorComponent } from './editors/route-to-queue-node-editor.component';
import { SendMessageNodeEditorComponent } from './editors/send-message-node-editor.component';
import { StartNodeEditorComponent } from './editors/start-node-editor.component';

@Component({
  selector: 'app-flow-inspector',
  imports: [
    StartNodeEditorComponent,
    SendMessageNodeEditorComponent,
    AskQuestionNodeEditorComponent,
    CollectVariableNodeEditorComponent,
    DecisionNodeEditorComponent,
    ConditionNodeEditorComponent,
    FallbackNodeEditorComponent,
    RouteToQueueNodeEditorComponent,
    HumanHandoffNodeEditorComponent,
    EndConversationNodeEditorComponent,
    PhaseTwoPlaceholderEditorComponent
  ],
  templateUrl: './flow-inspector.component.html',
  styleUrl: './flow-inspector.component.css'
})
export class FlowInspectorComponent {
  readonly store = inject(FlowBuilderStore);
  readonly getNodeTitle = getNodeTitle;
  readonly getNodeHeadline = getNodeHeadline;
  readonly getNodeSummary = getNodeSummary;
}
