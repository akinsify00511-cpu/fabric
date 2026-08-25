# AVENIZE DATA CONSTITUTION

## Canonical business model
Avenize data must represent one coherent business reality. Core domains include identity, businesses, people, customers, demand, meetings, CRM, quotes, orders, payments, subscriptions, finance, communications, analytics and intelligence.

## Laws
1. Every entity has one canonical representation.
2. Business ownership and tenancy are explicit.
3. Foreign keys enforce relationships wherever technically appropriate.
4. Financial records are immutable or append-only when required for auditability.
5. Derived metrics have a documented source of truth.
6. No UI-local data model may contradict the canonical database model.
7. Deletion semantics must be explicit: hard delete, soft delete, archive or immutable.
8. Personally identifiable and sensitive data must have a documented classification and retention policy.
9. Every critical state transition is auditable.
10. Data migrations preserve integrity and are verified before release.

## Lifecycle law
Entities move through explicit state machines. Invalid transitions are rejected at the authoritative layer, not merely hidden by the UI.

## Integrity law
The system must prefer database constraints, transactional operations and canonical domain functions over duplicated client-side assumptions.

## Provenance
AI-generated or inferred data must retain provenance, confidence where applicable, timestamp and source when the domain requires it.
