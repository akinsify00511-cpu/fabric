# AVENIZE DESIGN CONSTITUTION

The governing document for every visual and experiential decision in Avenize.
Ratified as a **formal product layer** (Phase A of the Design Intelligence
system). External design resources (21st.dev, Impeccable, getdesign.md,
awesome-design-md, taste-skill) are **inputs into our design process, never
dependencies of the production application and never the design authority**.
This document is the authority.

**Critical rule:** every new screen must use the Avenize design system.
No one-off styling unless explicitly justified in the PR description.
The rule is enforced in CI by `scripts/check_design_constitution.py`
(design-drift gate) — see §A6.

---

## A1. Foundations

### A1.1 Visual identity

Avenize is the **Business Operating System** — "More capable than an ERP.
Easier than WhatsApp." The product must feel like **one premium, intelligent
organism**: calm, confident, precise, alive. The signature surface is the
Business Brain (state → diagnosis → next best action → value), rendered on a
soft atmospheric backdrop with glass chrome and semantic card gradients.

Design dials (from the taste skill): **VARIANCE 5–6, MOTION 3–4, DENSITY 2–3**
for workspace/product UI.

### A1.2 Typography

- Family: `var(--font-family)` — Google Sans Flex (Inter as system fallback).
- Scale: `text-xs` (12) / `text-sm` (14) / `text-base` (16) / `text-lg` (18) /
  `text-xl` (20) / `text-2xl` (24) / `text-4xl` (36, hero/dominant metrics).
- Weight: 400 body, 500 emphasis, 600 headings, 700 hero numbers only.
- Dominant large numbers (`text-4xl`, 600–700) are reserved for the single
  primary metric of a card. Never a wall of giant numbers (see A2).

### A1.3 Spacing

4px grid. Use `--space-1` … `--space-9` (4px → 64px). Card padding `p-5`/`p-6`;
section rhythm `space-y-6`; inline gaps `gap-2`/`gap-3`. No arbitrary pixel
margins that break the grid.

### A1.4 Grid / layout

- App shell: fixed sidebar (grouped nav) + atmospheric content area
  (`.av-backdrop`). Content max width follows the page's purpose — dashboards
  use a 12-col responsive grid (`grid md:grid-cols-2 xl:grid-cols-3`);
  forms/detail views constrain to readable measure (~`max-w-3xl`).
- One primary action per surface, visually dominant; secondary actions are
  ghost/outline.

### A1.5 Color / tokens

**Every color resolves through the `--av-*` token source**
(`src/styles/avenize-brand.css`). Hardcoded hex in app pages/components is a
constitution violation tracked by the design-drift gate (§A6).

| Token | Value | Use |
|---|---|---|
| `--av-primary` | `#155BB4` | Brand primary (WCAG-AA on white) |
| `--av-primary-hover` / `-active` | `#1247A0` / `#0F3B86` | Interaction states |
| `--av-primary-soft` | `rgba(21,91,180,0.08)` | Selected/soft tint |
| `--av-surface` / `-2` / `-3` | white / `#F8F9FA` / `#F1F3F4` | Surfaces |
| `--av-text` / `-muted` / `-faint` | `#202124` / `#5F6368` / `#9AA0A6` | Text |
| `--av-border` | `#E8EAED` | Hairlines |
| `--av-success` / `-warning` / `-danger` / `-info` | `#34A853` / `#FBBC05` / `#EA4335` / `#4285F4` | Semantic status |
| `--av-glass-*`, `--av-shadow-float`, `--av-atmosphere`, `--av-grad-*` | glass + atmospheric language | Home/hero/intelligence surfaces |

Status colors are **semantic** (`--av-success` etc.), never raw
`bg-green-100 text-green-700` class soup (Session-25 sweep).

### A1.6 Elevation

Shadows, not borders, on cards: `--elevation-1` … `--elevation-4`,
`--av-shadow-float` for premium cards. Borders are hairlines for inputs,
tables, and dividers only.

### A1.7 Radius

`--radius-sm` 8 / `--radius-md` 12 / `--radius-lg` 16 / `--radius-xl` 24 /
pill. Cards default `rounded-2xl` (16) or `rounded-3xl` (24) on hero/intel
surfaces. Do not stack progressively rounder cards inside cards (A2).

### A1.8 Iconography

Lucide (`lucide-react`), standardized stroke, one icon size scale
(16/18/20/24). Icons carry meaning or wayfinding — never decoration (A2).

### A1.9 Illustration

Gamified empty states use the shared `EmptyState` component's milestone
badge + hint + tip pattern. No stock illustration packs, no fake product
screenshots built from styled divs.

### A1.10 Charts / data visualization

The **Representation Engine** (`src/components/RepresentationEngine.tsx`) is
the canonical data-representation layer: Number / Trend (SVG sparkline) /
Progress / Breakdown / Table. No external charting dependency; SVG + CSS
only. Every metric renders through it or through a `BusinessHomeCards` card.

### A1.11 Motion

`--duration-fast` 100ms / `--duration-normal` 200ms / `--duration-slow` 300ms,
`--ease-standard: cubic-bezier(0.2, 0, 0, 1)`. No bounce/spring. Motion must
communicate state (ambient state glow, pulse nodes, hover lift) — never
decorative (A2). Respect `prefers-reduced-motion` (`organism.css` does).

### A1.12 Responsive

Mobile-first Tailwind breakpoints (`md`, `xl`). Every surface must work on
desktop, tablet, and mobile (bottom nav + `md:hidden` header pattern in
Shell). The AI designer quality gate (A6) checks all three.

### A1.13 Accessibility

WCAG AA minimum: 4.5:1 small-text contrast (verify against the **actual**
rendered background, not white — soft tints lower contrast), visible focus
rings, `aria-label` on icon-only buttons, one `<main>` landmark per page,
keyboard navigability. Verified via the Lighthouse CI job (threshold 90).

### A1.14 Theming

Light theme is the primary product surface. The atmospheric backdrop
(`--av-atmosphere`) + glass chrome are the "living" layer. Dark theme, if
introduced, must be a full token theme — never per-component inversion.

---

## A2. Anti-AI-Slop Rules (normative)

Avenize explicitly rejects generic AI-SaaS output. Never ship:

1. Generic SaaS dashboards (uniform KPI card grids with no hierarchy).
2. Excessive glassmorphism (glass is for chrome + hero surfaces only).
3. Purple AI gradients (purple is the `--av-hr` accent only — never a
   brand/AI wash). Enforced in CI: `from/via/to-purple-*` classes drift-gated.
4. Random glowing blobs with no semantic meaning.
5. Excessive rounded cards / card-within-card-within-card nesting.
6. Decorative animation with no purpose.
7. Excessive icons (icon soup on every row).
8. Giant meaningless numbers (a number without a decision attached).
9. Fake "AI magic" terminology ("Elevate", "Seamless", "Game-changer",
   "Unleash").
10. Visual clutter / inconsistent spacing / inconsistent button styles /
    inconsistent empty states (all empty states use the shared `EmptyState`
    gamified contract).

---

## A3. Canonical Component System

**One component, one canonical implementation.** Before building a new
component, find the canonical one and extend it. Current canonical inventory:

| Domain | Canonical implementation |
|---|---|
| Shell / navigation | `src/components/Shell.tsx` (5-group grouped nav) |
| Buttons / inputs / modals | Token classes + `src/components/Modal.tsx` |
| Empty states | `src/components/EmptyState.tsx` (gamified contract) |
| Loading states | `src/components/Skeleton.tsx` (skeletons, never spinners) |
| Errors | `src/components/ErrorBoundary.tsx`, `src/components/Toast.tsx` |
| Metrics / charts | `src/components/RepresentationEngine.tsx` |
| Intelligence cards | `src/components/BusinessHomeCards.tsx` (GlassCard + 20 cards) |
| Evidence / confidence | `src/components/Evidence.tsx` (ClaimTag FACT/INFERENCE/…) |
| Approvals / reversal | `ApprovalRouter.tsx`, `Reversal.tsx` |
| People / meetings | `BusinessHomeCards` cards, `MeetingComponents.tsx`, `VideoRoom.tsx` |
| Command interface | `CommandPalette.tsx` |
| AI surface | `AskAvenize.tsx` (copilot), `AICapture.tsx` (capture) |
| Role/function home | `src/lib/roleHomeConfig.ts` + `src/lib/functionHome.ts` + `BusinessHome.tsx` |

A new canonical component requires extending this table in the same PR.

---

## A4. Role-Specific Experience System

The interface adapts to the person via **Function × Seniority × Permission ×
Personal Work × Business Brain** (Sessions 27/29/30):

- `deriveFunction(jobTitle, department, activeTools)` →
  marketing/sales/finance/hr/operations/projects/general.
- `deriveSeniority(role)` → executive/manager/lead/individual.
- `getFunctionHome(fn, sen)` composes the home from canonical cards.
- **Security invariant:** role/function personalization is UX emphasis only.
  RLS + `staff.role` + the two-flag module gate remain the authorization
  boundary. A marketing home never exposes finance rows RLS denies.

Executive surfaces (CEO): `ExecutiveCockpit` (Business Brain: state,
diagnosis, NBA, value ledger) + `OwnerIntelligence`. Function surfaces map to
the A4 checklist: Marketing → campaign/lead/pipeline cards; Sales →
pipeline/revenue/customers; Finance → cash/receivables/profit;
Operations → operations/workload; HR → people/attendance/leave.

---

## A5. The Living Business Visual Language

Avenize communicates the causal chain, not just data:

```
DATA → SIGNAL → INSIGHT → WHY → RISK/OPPORTUNITY → RECOMMENDATION → ACTION → OUTCOME
```

UI obligations:
- Every metric card carries a **confidence tag** (FACT / INFERENCE / UNKNOWN)
  via `ClaimTag`.
- Diagnoses show symptom (FACT) + cause (INFERENCE) + ₦ exposure.
- The Business Pulse renders health dimensions as connected glowing nodes —
  the business as one organism.
- Ambient state glow communicates business state (Growing/Stable/Stressed/
  At risk) without reading a word.
- Honest empty/insufficient-data states, always (§22).

---

## A6. AI Designer Quality Gate (enforced)

Before any AI-generated or human screen is accepted it must pass:

1. Does it look like Avenize (tokens, atmosphere, glass language)?
2. Does it follow the design system (canonical components, no one-offs)?
3. Is hierarchy obvious? Is the primary action obvious?
4. Is information density appropriate (DENSITY 2–3)?
5. Does every animation have purpose? Is motion within 100–300ms?
6. Desktop / tablet / mobile all work?
7. Accessibility: AA contrast, focus, aria, landmark?
8. Loading / error / empty states handled (Skeleton, honest error, gamified
   EmptyState)?
9. Free of every A2 anti-slop pattern?

**CI enforcement:** `scripts/check_design_constitution.py` runs as the
`design-constitution` CI job. It tracks hardcoded-hex and anti-slop-class
drift per file against `scripts/design_constitution_baseline.json` and fails
when any file's count grows or a new file introduces violations. Historical
violations are a recorded baseline to burn down, never to grow.
