import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getQueueDescription } from '../../flow-builder-display.utils';
import { RouteToQueueNode } from '../../flow-builder.models';
import { FlowBuilderStore } from '../../flow-builder.store';

@Component({
  selector: 'app-route-to-queue-node-editor',
  imports: [FormsModule],
  templateUrl: './route-to-queue-node-editor.component.html'
})
export class RouteToQueueNodeEditorComponent {
  readonly node = input.required<RouteToQueueNode>();
  readonly store = inject(FlowBuilderStore);
  readonly getQueueDescription = getQueueDescription;
}
