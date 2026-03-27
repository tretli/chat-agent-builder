import {
  ConditionOperator,
  QuestionResponseKind,
  QueueOption
} from './flow-builder.models';

export const MOCK_QUEUES: QueueOption[] = [
  {
    id: 'sales-priority',
    name: 'Sales Priority',
    description: 'High-intent conversations that should reach the sales desk fast.'
  },
  {
    id: 'support-general',
    name: 'Support General',
    description: 'Questions about existing accounts, service issues, and follow-up help.'
  },
  {
    id: 'onboarding-specialists',
    name: 'Onboarding Specialists',
    description: 'New customers who need implementation or setup guidance.'
  }
];

export const QUESTION_RESPONSE_KIND_OPTIONS: Array<{
  id: QuestionResponseKind;
  label: string;
}> = [
  {
    id: 'short-text',
    label: 'Short text'
  },
  {
    id: 'long-text',
    label: 'Long text'
  },
  {
    id: 'single-choice',
    label: 'Single choice'
  }
];

export const CONDITION_OPERATOR_OPTIONS: Array<{
  id: ConditionOperator;
  label: string;
  requiresValue: boolean;
}> = [
  {
    id: 'equals',
    label: 'Equals',
    requiresValue: true
  },
  {
    id: 'not-equals',
    label: 'Does not equal',
    requiresValue: true
  },
  {
    id: 'contains',
    label: 'Contains',
    requiresValue: true
  },
  {
    id: 'greater-than',
    label: 'Greater than',
    requiresValue: true
  },
  {
    id: 'less-than',
    label: 'Less than',
    requiresValue: true
  },
  {
    id: 'is-empty',
    label: 'Is empty',
    requiresValue: false
  },
  {
    id: 'is-not-empty',
    label: 'Is not empty',
    requiresValue: false
  }
];
