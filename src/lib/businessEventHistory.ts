import type { BusinessEvent } from './businessEventBus'

export type PersistedBusinessEvent<T = Record<string, unknown>> = BusinessEvent<T> & {
  sequence: number
  recordedAt: string
  schemaVersion: 1
}

export class BusinessEventHistory {
  private sequence = 0
  private readonly events: PersistedBusinessEvent[] = []

  append<T extends Record<string, unknown>>(event: BusinessEvent<T>): PersistedBusinessEvent<T> {
    const persisted: PersistedBusinessEvent<T> = {
      ...event,
      sequence: ++this.sequence,
      recordedAt: new Date().toISOString(),
      schemaVersion: 1,
    }
    // The generic event narrows payload to T; the store erases to the default
    // Record<string, unknown> (T extends Record<string, unknown>, so a value
    // of type T is assignable to Record<string, unknown>).
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
