import { Component, inject } from '@angular/core';
import { FlowBuilderStore } from '../flow-builder.store';
import { ValidationIssue } from '../flow-builder.models';

@Component({
  selector: 'app-flow-diagnostics',
  templateUrl: './flow-diagnostics.component.html',
  styleUrl: './flow-diagnostics.component.css'
})
export class FlowDiagnosticsComponent {
  readonly store = inject(FlowBuilderStore);

  trackByIssue(index: number, issue: ValidationIssue): string {
    return `${issue.code}-${issue.nodeId ?? 'global'}-${index}`;
  }
}
