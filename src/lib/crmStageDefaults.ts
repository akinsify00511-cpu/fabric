export const DEFAULT_CRM_STAGES = [
  { key: 'new_lead', name: 'New Lead', probability: 10, color: 'gray', sort_order: 0 },
  { key: 'qualified', name: 'Qualified', probability: 25, color: 'blue', sort_order: 1 },
  { key: 'proposal', name: 'Proposal', probability: 50, color: 'yellow', sort_order: 2 },
  { key: 'negotiation', name: 'Negotiation', probability: 75, color: 'orange', sort_order: 3 },
  { key: 'won', name: 'Won', probability: 100, color: 'green', sort_order: 4 },
  { key: 'lost', name: 'Lost', probability: 0, color: 'red', sort_order: 5 },
] as const;

export type CRMStageKey = (typeof DEFAULT_CRM_STAGES)[number]['key'];
