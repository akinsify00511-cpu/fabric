# FABRIC — Layer 1

Self-configuring business OS. Layer 1 covers CRM, Projects, Finance (invoicing), Inventory, and People (HR tracking only — no statutory payroll processing).

## Brand
- Colors: black #111111, off-white #F7F7F8, gray #E9ECEF, gradient accent #FF7A59 → #4F46E5
- Font: Inter
- Logo: four interlocking rounded squares — `src/components/FabricMark.tsx`

## Stack
- Vite + React + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Row-Level Security, Auth)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` (pre-filled with the FABRIC Supabase project's URL and public key)
3. `npm run dev`

## Signup & onboarding

Fully self-serve, no manual database work needed:

- **First user (owner):** go to `/signup` — enter business name, your name, email, password. Powered by a `bootstrap_business()` Postgres function (SECURITY DEFINER) that atomically creates the business and your owner `staff` row.
- **Everyone after that:** owner/manager goes to People → "Invite a teammate", enters an email + role (staff or manager), and gets a shareable link (`/join/<invite-id>`) to copy and send however they like — WhatsApp, email, etc. **No email is sent automatically yet** — that needs an email provider wired in, which is a later-layer task. The invitee opens the link, sees which business and role they're joining, signs up, and is added to the same business automatically. Invites expire after 7 days and can only be used once.
- Both flows correctly handle Supabase's "confirm email" setting being on or off — if confirmation is required, the invitee/owner lands on `/onboarding` after confirming, which finishes the same setup step.

## Structure

- `src/lib/supabase.ts` — Supabase client
- `src/lib/AuthContext.tsx` — session + staff profile, with `refreshStaff()`
- `src/lib/types.ts` — shared types matching the DB schema
- `src/components/FabricMark.tsx` — logo mark
- `src/components/Shell.tsx` — responsive layout: sidebar on desktop, floating bottom pill nav + top header on mobile
- `src/pages/` — Login, Signup, Onboarding, Join, Dashboard, CRM, Projects, Finance, People, Inventory, Reports, Settings, More

## Deploying

Push to GitHub, import the repo in Vercel, add the two `VITE_SUPABASE_*` env vars from `.env`.

## Next layers (not built yet)

Real email delivery for invites (currently link-copy only), cross-module automations, approvals, chat/tasks, the AI context engine — see the FABRIC PRD for full sequencing.
