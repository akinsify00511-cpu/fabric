# Supabase Source of Truth

The constitutional source (naming, migration, and contract rules) lives in
`governance/AVENIZE-SUPABASE-CONSTITUTION.md`.

This directory holds the **machine-readable desired state** of production:

| Manifest | Derived from |
|----------|--------------|
| `schema-manifest.json` | `production_contract.json` objects (tables + views) |
| `rpc-manifest.json` | `production_contract.json` functions with identity signatures |
| `policy-manifest.json` | `CREATE POLICY` in the canonical migration chain |
| `trigger-manifest.json` | `CREATE TRIGGER` in the canonical migration chain |
| `index-manifest.json` | `CREATE INDEX` in the canonical migration chain |
| `edge-function-manifest.json` | `supabase/functions/*` + frontend-invoked functions |

Regenerate with:

```bash
python3 scripts/generate_supabase_manifests.py
```

The artifacts are deterministic (no timestamps). Regeneration must be a
no-op on unchanged inputs — the governance runner asserts this through the
`supabase.manifests` rule. The drift engine compares these manifests against
the live environment: `UNKNOWN` never counts as healthy.
