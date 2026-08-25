# AVENIZE DEVELOPER CONSTITUTION

## Before changing code
1. Read the governing constitution and relevant layer constitution.
2. Identify the canonical domain and existing contract.
3. Search before creating a new table, RPC, component, event or service.
4. Determine dependencies and security implications.
5. Define verification before implementation.

## During implementation
- Reuse canonical contracts.
- Do not create duplicate concepts.
- Keep migrations ordered and immutable after production application.
- Add tests for behavior and failure modes.
- Add observability for critical paths.
- Preserve backwards compatibility unless a migration plan exists.

## After implementation
Run the applicable constitution checks, unit/integration tests, schema validation, security checks and production contract tests where credentials/environment permit.

## AI developer rules
AI agents must explain uncertainty rather than invent missing infrastructure. They must not bypass failing tests by weakening assertions, deleting tests, disabling RLS, suppressing errors or creating undocumented fallback paths. When a requested change conflicts with a constitution, the conflict must be surfaced explicitly.
