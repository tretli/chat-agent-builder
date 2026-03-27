import { Component, input } from '@angular/core';
import { StartNode } from '../../flow-builder.models';

@Component({
  selector: 'app-start-node-editor',
  templateUrl: './start-node-editor.component.html'
})
export class StartNodeEditorComponent {
  readonly node = input.required<StartNode>();
}
