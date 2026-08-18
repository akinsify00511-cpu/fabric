import type { BusinessEvent } from './businessEventBus'

export type PersistedBusinessEvent = BusinessEvent & {
  sequence: number
  recordedAt: string
  schemaVersion: 1
}

export class BusinessEventHistory {
  private sequence = 0
  private readonly events: PersistedBusinessEvent[] = []

  append<T>(event: BusinessEvent<T>): PersistedBusinessEvent {
    const persisted: PersistedBusinessEvent = {
      ...event,
      sequence: ++this.sequence,
      recordedAt: new Date().toISOString(),
      schemaVersion: 1,
    }
    this.events.push(persisted)
    return persisted
  }

  list(filter?: { organizationId?: string; subsidiaryId?: string; type?: BusinessEvent['type']; entityId?: string }) {
    return this.events.filter((event) =>
      (!filter?.organizationId || event.organizationId === filter.organizationId) &&
      (!filter?.subsidiaryId || event.subsidiaryId === filter.subsidiaryId) &&
      (!filter?.type || event.type === filter.type) &&
      (!filter?.entityId || event.entityId === filter.entityId),
    )
  }
}
