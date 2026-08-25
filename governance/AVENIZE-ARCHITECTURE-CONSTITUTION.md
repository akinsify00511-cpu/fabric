# AVENIZE ARCHITECTURE CONSTITUTION

## System law
Avenize is a single business operating system composed of bounded domains sharing canonical identity, tenancy, events, permissions and observability.

## Domain boundaries
Each domain owns its business rules and contracts. Cross-domain behavior occurs through explicit contracts/events, not hidden coupling or duplicated database logic.

## Source-of-truth hierarchy
1. Authoritative transactional state: governed database/domain services.
2. Derived state: recomputable projections and analytics.
3. UI state: presentation and interaction state only.
4. Cache: disposable optimization, never the sole source of truth.

## Event law
Important state transitions emit canonical domain events with actor, tenant, entity, event type, timestamp, correlation ID and schema version where applicable.

## Failure law
Every dependency has explicit timeout, retry, fallback and escalation behavior. Critical business operations must be transactional or have compensating actions.

## Evolution law
Architecture changes must preserve tenant isolation, security boundaries, data integrity, observability and migration compatibility.
