import { QueueOption } from './flow-builder.models';

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
