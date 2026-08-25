# AVENIZE API CONTRACT CONSTITUTION

## Contract-first law
Every cross-boundary interaction is a versioned contract: UI↔application service, application↔RPC, application↔Edge Function, application↔external provider.

## Required contract properties
- stable identifier;
- input validation;
- output schema;
- typed errors;
- authorization expectations;
- timeout/retry policy;
- idempotency semantics for mutations;
- observability event;
- contract test.

## Compatibility
Breaking changes require a migration path or coordinated release. The client must never infer undocumented fields or silently tolerate incompatible backend responses.

## Error law
Errors are classified as validation, authorization, not-found, conflict, dependency, transient, provider, internal or unknown. Unknown errors are observable and never silently swallowed.

## Critical journey contract
Signup, onboarding, business creation, meeting/capture, demand, CRM, quote, order, payment and analytics must have executable contract coverage.
