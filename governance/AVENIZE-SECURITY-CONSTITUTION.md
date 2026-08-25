# AVENIZE SECURITY CONSTITUTION

## Non-negotiable rules
- Never expose service-role or secret credentials to clients.
- Authentication and authorization are separate controls.
- Authorization is enforced at the authoritative backend boundary.
- RLS is enabled on exposed user-data tables and policies are reviewed against actual tenancy/ownership semantics.
- User-editable metadata is never trusted for authorization.
- Privileged functions are minimized and explicitly reviewed.
- Secrets are stored only in approved secret stores.
- Sensitive operations are auditable.
- Security failures block production promotion.

## Security verification
Every release checks authentication flows, authorization boundaries, RLS coverage, secret exposure, privileged functions, storage policies, webhook verification and dependency security.

## Incident law
A detected security incident automatically enters containment mode. Evidence is preserved, affected capabilities are isolated where safe, and human approval is required for irreversible remediation.
