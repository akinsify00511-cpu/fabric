export type BusinessEventType =
  | 'lead.created'
  | 'customer.acquired'
  | 'deal.won'
  | 'revenue.received'
  | 'campaign.launched'
  | 'market.signal.detected'
  | 'decision.approved'
  | 'decision.completed'
  | 'experiment.completed'
  | 'kpi.deteriorated'
  | 'opportunity.discovered'

export type BusinessEvent<T = Record<string, unknown>> = {
  id: string
  type: BusinessEventType
  organizationId: string
  subsidiaryId: string
  occurredAt: string
  actorId?: string
  correlationId?: string
  entityId?: string
  payload: T
}

export type BusinessEventHandler = (event: BusinessEvent) => void | Promise<void>

export class BusinessEventBus {
  private readonly handlers = new Map<BusinessEventType, Set<BusinessEventHandler>>()

  subscribe(type: BusinessEventType, handler: BusinessEventHandler) {
    const handlers = this.handlers.get(type) ?? new Set<BusinessEventHandler>()
    handlers.add(handler)
    this.handlers.set(type, handlers)
    return () => handlers.delete(handler)
  }

  async publish<T>(event: BusinessEvent<T>) {
    const handlers = this.handlers.get(event.type) ?? new Set<BusinessEventHandler>()
    await Promise.all([...handlers].map((handler) => handler(event as BusinessEvent)))
  }
}

export function createBusinessEvent<T>(input: Omit<BusinessEvent<T>, 'id' | 'occurredAt'> & Partial<Pick<BusinessEvent<T>, 'id' | 'occurredAt'>>): BusinessEvent<T> {
  return {
    ...input,
    id: input.id ?? crypto.randomUUID(),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  }
}
