# AVENIZE DESIGN CONSTITUTION

**Status:** Governing design law. **Version:** 1.0 (2026-08-24)
**Relationship:** This file is the *constitutional layer* (principles + hard rules +
enforcement). Operational detail (full token list, component inventory, rationale) lives
in the root `AVENIZE-DESIGN-CONSTITUTION.md` and `src/styles/avenize-tokens.css`. If the
two disagree, this file wins. Subordinate to `AVENIZE_PRODUCT_CONSTITUTION.md`.

---

## D1 — Token-Only Styling (HARD RULE, CI-ENFORCED)

1. Every color comes from `--av-*` CSS custom properties (or the BRAND token object that
   wraps them). Hardcoded hex in components is drift. The single source of truth is
   `src/styles/avenize-brand.css` + `avenize-tokens.css` — one token change re-themes
   the app (precedent: primary unification `#4285F4` → `#155BB4`; 65 files inherited).
2. Cards use elevation tokens, not borders. Radius from the 8/12/16/24px scale.
   Spacing on the 4px grid. Motion 100–300ms `cubic-bezier(0.2, 0, 0, 1)` — no
   bounce/spring. Gradients only on marketing surfaces, never in `/app/*` chrome.
3. **Enforcement:** `scripts/check_design_constitution.py` +
   `scripts/design_constitution_baseline.json` run as CI gates (`design-constitution`
   job in ci.yml + schema-drift.yml). The gate FAILS on any new violating file or any
   per-file growth. The baseline only burns down; `--write-baseline` regenerates only
   after a deliberate reviewed change.
4. Verified state (2026-08-24): hex 1076 (baseline 1214), slop 101 (baseline 119) —
   burning down, gate PASS.

## D2 — Anti-Slop (No Generic AI Aesthetics)

1. Forbidden: purple-gradient heroes, three equal feature cards, generic glassmorphism,
   fake product previews built from styled divs, AI copywriting clichés
   ("Elevate", "Seamless", "Game-changer"), `animate-bounce` decoration.
2. Required: Lucide icons (standardized stroke), skeleton loaders over spinners,
   realistic content (no "John Doe"), token-based colors, Google Sans Flex typography.
3. Taste dials for Avenize workspace UI: VARIANCE 5–6, MOTION 3–4, DENSITY 2–3.

## D3 — One Component = One Implementation

1. Reuse the canonical component inventory (EmptyState, Evidence/ClaimTag, GlassCard,
   RepresentationEngine, the toast system) before creating anything new.
2. Duplicate component pairs are constitutional debt (precedent: EmptyState vs
   EmptyStates plural — consolidated toward the canonical gamified EmptyState).

## D4 — Honest, Gamified Empty States

1. Every empty state is either (a) a true-empty *first-step* surface — milestone badge
   ("Your first deal"), coaching hint, concrete tip, single CTA; or (b) a filter-empty
   plain "no results" state. Never a dead-end "No X yet" notice.
2. Absence of work is framed as achievement ("Inbox zero"), never as a void.
3. Loading ≠ empty ≠ error: the three states are visually distinct everywhere.

## D5 — Accessibility Is A Release Gate (WCAG 2.2 AA)

1. Contrast ≥ 4.5:1 for small text — computed against the ACTUAL rendered background
   (soft tints lower contrast vs pure white; measure, don't guess).
2. Keyboard navigable; visible focus; every icon-only button has an aria-label; dialogs
   trap focus; notifications are announced; `prefers-reduced-motion` respected.
3. Landmarks: one `<main>` per page. Forms have associated labels.
4. Accessibility failure in a critical workflow (auth, onboarding, checkout, meetings)
   blocks release. Local Lighthouse accessibility = 100 is the standing bar.

## D6 — Consistency Across Surfaces

1. Public site → onboarding → app → mobile share ONE visual language (same primary,
   same surfaces, same radii). A "jarring jump" between surfaces is a defect class.
2. Native blocking `alert()` / browser confirms are forbidden in product UI — use the
   toast system / modal components.
3. The app shell is one organism: atmospheric backdrop, glass chrome, premium cards
   (`.av-card` / `.av-glass-card`) — no per-page visual dialects.
