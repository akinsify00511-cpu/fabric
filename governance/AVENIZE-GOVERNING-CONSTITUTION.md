# AVENIZE GOVERNING CONSTITUTION

**Status:** Binding
**Authority:** Highest engineering and product governance document
**Scope:** Entire Avenize product, codebase, database, infrastructure, AI agents, operations, security, data, UX, payments, analytics, and production environments.

## 1. Purpose
Avenize must operate as a coherent business operating system, not as a collection of pages, services, migrations, and AI-generated patches. Every component must obey a shared source of truth and every production capability must be verifiable.

## 2. Constitutional hierarchy
In descending authority:

1. Governing Constitution — why Avenize exists, non-negotiable principles, authority, safety, autonomy boundaries.
2. Product Constitution — what Avenize must do for customers.
3. Architecture Constitution — how capabilities are structured and connected.
4. Data Constitution — canonical business entities, ownership, lifecycle, integrity.
5. Supabase Constitution — database naming, migrations, RPCs, RLS, triggers, views, storage, deployment and drift control.
6. API Contract Constitution — stable contracts between UI, services, database and external providers.
7. Security Constitution — authentication, authorization, secrets, RLS, auditability and threat controls.
8. UX/Design Constitution — interaction quality, accessibility, visual consistency and error states.
9. Intelligence Constitution — AI behavior, confidence, provenance, permissions, memory and decision boundaries.
10. Operations Constitution — health, observability, incident response, backups, recovery and release gates.
11. Autonomy Constitution — what the system may detect, repair, optimize, quarantine, rollback and escalate automatically.
12. Developer Constitution — rules every human or AI developer must follow.

Lower layers may implement higher layers but may never contradict them. When documents conflict, the higher layer wins.

## 3. Core laws
- Production truth outranks local assumptions.
- A capability is not complete until its production contract is verified.
- No application code may depend on an undocumented backend contract.
- No database object may exist without an owner, purpose, dependency record and verification path.
- No destructive autonomous action is permitted without an explicit safety policy.
- Every migration must be deterministic, ordered, replay-safe where possible, and verifiable.
- Every critical customer journey must have an executable end-to-end test.
- Security failures are release blockers.
- Data integrity failures are release blockers.
- Payment correctness is a release blocker.
- Silent failure is prohibited for critical workflows.
- Observability is part of the feature, not an afterthought.
- AI may automate execution only inside explicitly bounded authority.

## 4. Definition of done
A feature is DONE only when:

`Requirement → Design → Data Contract → Backend Contract → UI → Security → Observability → Tests → Production Verification → Documentation`

are all satisfied.

## 5. Autonomous governance
Avenize shall continuously maintain a machine-readable desired state. The control plane compares desired state with observed state and classifies differences as:

- DRIFT — expected object/configuration absent or different.
- DEFECT — implementation violates a contract.
- INCIDENT — production behavior is materially degraded.
- SECURITY — authorization, secret, privacy or integrity risk.
- UNKNOWN — insufficient evidence; escalate, never guess.

The system may automatically repair only deterministic, reversible, pre-approved classes of drift. It must create an audit record for every automatic action.

## 6. Human authority boundary
The autonomous system must escalate before:

- destructive data changes;
- irreversible migrations;
- changing authorization semantics;
- exposing private data;
- rotating or revealing secrets;
- changing payment settlement logic;
- deleting production data;
- disabling security controls;
- changing constitutional rules;
- making a decision whose evidence is ambiguous.

## 7. Production truth rule
The repository, migration history, manifests and live environment are continuously compared. Avenize must never declare itself production-ready from repository state alone.

## 8. Constitutional enforcement
Every pull request and production release must run the constitution validator. A failed mandatory control blocks promotion.

## 9. Amendment rule
Constitutional changes require an explicit change record explaining the reason, affected layers, migration/compatibility impact, safety impact and verification plan. AI agents may propose amendments but may not silently rewrite constitutional authority.
