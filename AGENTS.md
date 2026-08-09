# AVENIZE - AI Agent Instructions

## Design Taste Skills

This repository includes premium design taste skills to ensure all UI output looks intentional and professional:

### Available Skills (`.agents/skills/`)

| Skill | Use When | Key Focus |
|-------|----------|-----------|
| **taste-skill** | Any frontend work | Anti-slop, 3-dial system (VARIANCE/MOTION/DENSITY), design read first |
| **soft-skill** | High-end consumer/agency builds | Awwwards-tier, haptic depth, cinematic motion |
| **minimalist-skill** | Workspace/product UI | Linear/Notion vibes, editorial typography, warm monochrome |
| **redesign-skill** | Improving existing projects | Audit-first, fix hierarchy, spacing, states |

### Quick Reference: Taste Skill 3 Dials

```
DESIGN_VARIANCE: 8   (1=Symmetry, 10=Artsy)
MOTION_INTENSITY: 6  (1=Static, 10=Cinematic)
VISUAL_DENSITY: 4    (1=Airy, 10=Packed)
```

For Avenize's workspace/product UI, use: VARIANCE: 5-6, MOTION: 3-4, DENSITY: 2-3

### Design Rules (From taste-skill)

**Anti-patterns to avoid:**
- ❌ AI-purple gradients, centered hero over dark mesh
- ❌ Three equal feature cards
- ❌ Generic glassmorphism on everything
- ❌ Inter + slate-900 defaults
- ❌ Fake product previews built from styled divs
- ❌ AI copywriting clichés ("Elevate", "Seamless", "Game-changer")

**Preferred patterns:**
- ✅ Phosphor or Lucide icons (standardized stroke)
- ✅ Motion animations for interactive elements
- ✅ Skeleton loaders instead of spinners
- ✅ Realistic content, not "John Doe" placeholders
- ✅ Google Sans Flex typography
- ✅ Token-based colors from brand system

---

## Brand System (Google Standard Edition)

Treat Avenize as if it were built by Google's Workspace team — indistinguishable from Gmail, Calendar, or Admin Console.

### Color Tokens (CSS Custom Properties)

```css
/* Brand / Primary */
--google-blue: #4285F4;
--google-blue-hover: #3367D6;
--google-blue-active: #2A5DB0;
--google-blue-light: rgba(66, 133, 244, 0.08);

/* Surfaces */
--surface-primary: #FFFFFF;
--surface-secondary: #F8F9FA;
--surface-tertiary: #F1F3F4;
--surface-inverse: #202124;

/* Text */
--text-primary: #202124;
--text-secondary: #5F6368;
--text-tertiary: #9AA0A6;
--text-disabled: #DADCE0;

/* Semantic */
--color-success: #34A853;
--color-warning: #FBBC05;
--color-error: #EA4335;
--color-info: #4285F4;

/* Workspace accents */
--accent-sales: #4285F4;
--accent-finance: #34A853;
--accent-projects: #FBBC05;
--accent-hr: #8B5CF6;
--accent-comms: #EC4899;
--accent-ai: #06B6D4;
--accent-automation: #F97316;
--accent-analytics: #6366F1;

/* Borders */
--border-light: #E8EAED;
--border-medium: #DADCE0;
```

### Elevation (Shadows - no borders on cards)

```css
--elevation-1: 0 1px 2px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06);
--elevation-2: 0 2px 4px rgba(0,0,0,.1), 0 4px 8px rgba(0,0,0,.06);
--elevation-3: 0 4px 8px rgba(0,0,0,.1), 0 8px 16px rgba(0,0,0,.06);
--elevation-4: 0 8px 16px rgba(0,0,0,.1), 0 16px 32px rgba(0,0,0,.08);
```

### Radius Scale

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-pill: 9999px;
--radius-full: 50%;
```

### Motion

```css
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

### React BRAND Object

```tsx
const BRAND = {
  primary: '#4285F4',
  primaryHover: '#3367D6',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#34A853',
  warning: '#FBBC05',
  danger: '#EA4335',
}
```

## Hard Rules

1. **Every color from tokens** — never hardcoded hex in components
2. **Cards: shadow, no border** — use elevation tokens, never add borders to cards
3. **Typography: var(--font-family)** — Google Sans Flex
4. **Radius from tokens** — 8/12/16/24px only
5. **Spacing: 4px grid** — --space-1 to --space-9
6. **Motion: 100-300ms** — cubic-bezier(0.2, 0, 0, 1), no bounce/spring
7. **Gradient only marketing** — never in /app/* chrome

## Files

- Token file: `src/styles/avenize-tokens.css`
- Design spec: `AVENIZE-DESIGN-SPECIFICATION.md`
- Brand doc: `/workspace/Avenize-Brand-System-Google-Standard.md`

## Architecture & Build (verified, commit 735a612)

- **Stack:** Vite + React 19 + TypeScript, Tailwind v4, Supabase (Postgres + RLS + Edge Functions), no dedicated backend server — the SPA talks to Postgres directly via the Supabase SDK; RLS is the real authorization boundary.
- **Build/verify:** `npm install` → `npx tsc -b --noEmit` (typecheck) → `npx vite build` (production build). Both must pass before committing. No Postgres runtime in the dev container, so DB tests (`tests/database/*.sql`, pgTAP) and Playwright tests run in CI with a live Supabase.
- **RLS pattern:** business-scoped tables use `business_id = (SELECT business_id FROM public.get_current_staff())` where `get_current_staff()` (defined in `001_initial_schema.sql`) returns the current staff row via `auth.uid()`. Client-side `src/lib/permissions.ts` is UX gating only — never the security control.
- **Migrations:** `supabase/migrations/*.sql`, numbered `0NN_name.sql`. Use `\set ON_ERROR_STOP on`. `CREATE OR REPLACE FUNCTION` + `CREATE TABLE IF NOT EXISTS` for idempotency. `update_updated_at()` trigger helper lives in `007_automations.sql`.
- **Two parallel stock models:** `products` (has its own `stock` integer column) and `inventory` (separate table, no `product_id` FK). `stock_movements.inventory_id` FK→`inventory`. Update `products.stock` directly when receiving goods against a PO line that references `products`.
- **UI↔schema drift is the highest-risk defect class:** several pages (ElectronicSignatures, PublicAppointments) previously queried tables with no migration. When adding a page, confirm every `.from('table')` has a backing migration before shipping.

## Recent work (2026-08)

- Migrations `043_signatures_appointments_schema.sql`, `044_property_vertical_completion.sql`, `045_purchase_vendor_workflow.sql` added the signature/appointments/property-vertical/PO schemas that pages were referencing but missing.
- `ElectronicSignatures.tsx`: removed demo-data fallback; now does a joined `signature_requests`↔`signature_signers` query and a normalized two-step insert.
- `PublicAppointments.tsx`: replaced `Math.random()` slot "availability" with a real overlap query against `appointments`.
- `Services.tsx` (new): admin page to manage the service catalog the public booking page reads from.
