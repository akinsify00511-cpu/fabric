# AVENIZE DISCOVERY INTELLIGENCE ARCHITECTURE

Phase B of the two-layer directive (Design Intelligence + Discovery
Intelligence). This is a **formal product layer**, not a plugin: it has its
own schema, its own page, its own module gate, its own CI boundary, and it
closes into the Business Brain's revenue loop.

## B1 — The architecture

```
                    DISCOVERY INTELLIGENCE
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
       SEO                AEO                GEO
   search engines     answer engines     AI citations
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                          AIO          (entity understanding:
                           │            robots.txt, structured data,
                           │            brand truths)
                           ↓
                 CONTENT INTELLIGENCE
                 (opportunities + the
                  B11 quality gate)
                           ↓
                 REVENUE ATTRIBUTION
                 (B14 closed loop into
                  deals / subscriptions)
```

## The boundary (B3) — mandatory

The discovery machinery operates on the business's **public surface only**.
It never turns customer business data (CRM, finance, meetings, receipts,
Business Brain context) into public discovery content.

| Public (indexable) | Private (never crawled/indexed) |
|---|---|
| `/`, `/pricing`, `/signup`, `/book`, `/lead(s)` | `/app/*`, `/onboarding`, `/join`, `/sign`, `/upgrade`, operator surfaces (`/builder`, `/platform-ops`), auth utility routes |

Enforced at three layers:
1. `public/robots.txt` — Disallow for every private route; explicit AI-crawler
   groups (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) get the same
   boundary: welcome on public, denied on private.
2. `public/sitemap.xml` — lists ONLY public routes. Nothing private is ever
   sitemap-listed.
3. Auth + RLS — the application itself is behind `RequireAuth` + row-level
   security; crawlers receive no private data regardless of robots compliance.

## Scope model

Discovery Intelligence is **business-scoped**: every business monitors the
discovery of its own brand, its own queries, its own content ROI. RLS via
`get_current_staff()` is the tenant boundary. Avenize-the-company is the
first tenant of its own system (its marketing team runs its own instance of
the same module).

## Data model (migration 20260819090000)

| Table | Phase | Purpose |
|---|---|---|
| `discovery_targets` | B6/B7/B9 | Tracked queries/questions (kind: seo/aeo/geo, cluster, priority) |
| `discovery_observations` | B7 | Recorded engine-answer checks — each row a FACT with a timestamp |
| `discovery_brand_truths` | B4/B8 | The business's declared entity truths |
| `discovery_brand_checks` | B8 | AI statement vs truth → mismatch → severity → correction |
| `content_opportunities` | B10/B11 | What to write + enforced quality gate |
| `discovery_content` | B12/B14 | Published pieces (attribution anchors) |
| `discovery_referrals` | B14 | Provenance-tagged arrivals linked to produced entities |

RPCs (all SECURITY DEFINER + membership-guarded, zz-closure pattern):
`seed_discovery_defaults`, `discovery_overview` (B13),
`discovery_query_leaderboard` (B9), `discovery_brand_truth_report` (B8),
`discovery_roi` (B14), `record_discovery_referral`.

## The B11 quality gate (authority, not volume)

`content_opportunities.status = 'published'` is blocked by trigger unless
`originality_confirmed AND evidence_confirmed AND human_reviewed`. The system
structurally cannot become an AI content factory.

## The B8 severity ladder (deterministic)

`classifyBrandMismatch` (src/lib/discoveryIntel.ts): the truth's category
phrase (terms after "is a/an/the") is compared against the AI statement's
category phrase — name overlap never masks a category error.

- categories disjoint + brand absent → **critical** (a wholly different identity)
- categories disjoint + brand present → **high**
- no category assertion + zero overlap → **medium** (incomplete)
- partial → **low**; accurate → none

## B14 — the closed loop

```
SEARCH / AI CITATION → VISIT (referral w/ provenance) → SIGNUP
  → BUSINESS CREATED (referral linked, entity_type='business')
  → SUBSCRIPTION (discovery_roi joins subscription_payments)
```

For customer tenants: referral → deal links (`entity_type='deal'`) → won-deal
revenue. Revenue is attributed ONLY through explicit links against real
tables. No links → total 0 + an honest note. Never estimated (§22).

Provenance capture: `src/lib/attribution.ts` on the public surfaces
(landing/pricing/signup); AI-engine referrers (chatgpt/perplexity/claude/
gemini) are classified `ai-citation` automatically.

## Role-based information architecture (Phase D)

- **Executives**: the full surface (Growth Intelligence answers "where is the
  market discovering us / what generates demand / what are competitors
  winning / what next").
- **Marketing function** (derived from job_title/department): full surface.
- **Other employees**: restricted notice. UX emphasis only — RLS + the
  membership-guarded RPCs are the actual boundary.

## §22 anti-fabrication contract

- Observations are recorded facts; aggregates compute from them only.
- `presence_rate`/`citation_rate` are NULL (not 0%) when nothing observed.
- ROI is 0-with-note when nothing is linked.
- Structured data in `index.html` must never contradict the visible page
  (the fabricated aggregateRating + invented FAQ stats were removed).

## Sprint status map

| Sprint | State |
|---|---|
| 1 — Foundation (constitution, tokens, anti-slop, discovery architecture, boundary) | ✅ Done (Phase A + B foundation commits) |
| 2 — UI transformation (shell, role homes, Brain visualization) | ✅ Done Sessions 27–30 |
| 3 — SEO foundation (robots, sitemap, metadata, structured data) | ✅ Done (B foundation commit) |
| 4 — AEO/GEO (topic architecture, citation monitoring, brand truth, competitor visibility, opportunities) | ✅ Data layer + UI done; monitoring ingestion is human-recorded (automated engine polling is the next increment) |
| 5 — Growth Intelligence (dashboard, content ROI, citation → revenue) | ✅ Loop built end-to-end; populates as referrals + links accrue |
| 6 — Quality gate (security/tenant/role/SEO/GEO/AEO/accessibility audits) | ◐ Design + drift + RLS gates in CI; full audit pass pending |

## Deploy status

Migration `20260819090000` is idempotent and verified on postgres:15 (clean
apply ×2, RLS tenant isolation as the authenticated role, guard matrix, ROI
loop). It must be applied to the live Supabase (project
kgsgqvatyleetyquffya) alongside the other pending migrations. The page
degrades gracefully until then (empty states teach the first observation).
