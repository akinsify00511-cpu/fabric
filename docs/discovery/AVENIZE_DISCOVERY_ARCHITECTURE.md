# AVENIZE DISCOVERY ARCHITECTURE (SEO / GEO / AEO / AIO)

**Version:** 1.0 (2026-08-24). Operational detail: root
`DISCOVERY_INTELLIGENCE_ARCHITECTURE.md`; enforcement: RouteMeta + CI gates.

## The public/private boundary (the foundational rule)

- **Public surface:** `/`, `/pricing`, `/signup`, `/book`, `/quote/:token` (token),
  `/sign/:token` (token). Nothing else is public.
- **Enforcement, two layers:** `public/robots.txt` (explicit Allow/Disallow +
  per-AI-crawler groups: GPTBot/ClaudeBot/PerplexityBot/Google-Extended share the
  same boundary) + `src/components/RouteMeta.tsx` (runtime robots meta for
  JS-rendering crawlers — the SPA serves one index.html with index,follow, so the
  private boundary must be re-asserted at runtime). Boundary contract locked by
  `tests/frontend/lib/routeMeta.test.ts`.
- **Never exposed:** any tenant data, `/app/*`, `/builder`, `/platform-ops`,
  `/riverways-admin`, onboarding/join flows.

## Technical SEO

- `public/sitemap.xml`: public routes only.
- Real assets: og-image.png (1200×630) + logo.png (both were 404s before — verify
  referenced assets exist when adding meta).
- Canonical URLs + metadata in `index.html`; theme-color matches the unified primary.
- Structured data tells the truth: no fabricated aggregateRating, no fake SOC-2 or
  savings claims, schema pricing matches the real NGN tiers (Google policy compliance
  is a constitutional anti-fabrication issue, not just SEO).

## GEO / AEO / AIO

- `public/llms.txt`: the machine-readable entity-truth file (what Avenize is, in
  language AI engines can cite).
- Discovery Intelligence layer (migration 20260819090000): discovery_targets,
  observations, brand_truths (+category-aware severity), content_opportunities
  (quality gate: no publish without originality + evidence + human review),
  discovery_content, discovery_referrals. RPCs: seed_discovery_defaults,
  discovery_overview, discovery_query_leaderboard, discovery_brand_truth_report,
  discovery_roi, record_discovery_referral.
- Page: `/app/discovery` (Reach group; executives + marketing function; RLS+RPCs are
  the boundary).

## Attribution (discovery → revenue)

- `src/lib/attribution.ts`: UTM/referrer capture on Landing/Pricing/Signup;
  Onboarding records the referral linked to the new business — the first hop of the
  discovery → visit → signup → business → subscription revenue chain.
- AI engines in referrers classify as `ai-citation`.

## Rules

1. Marketing copy about the product must match the product (no "SOC 2", no invented
   customer counts, no invented benchmarks).
2. New public route → add to sitemap + robots allow-list + RouteMeta public set +
   boundary tests, in the same change.
3. Never expose private tenant information for discoverability.
