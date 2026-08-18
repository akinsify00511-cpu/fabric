# Meeting, Communication & Meeting Intelligence — Architecture Impact Report

Per section 48 of the build instruction: inspect before building. This report
identifies existing systems to reuse, extend, or avoid; required migrations;
RLS; the media/AI boundaries; UI routes; risks; and implementation phases.

---

## A. Existing meeting infrastructure (what's already there)

### Database
- **`meetings` table** (migration 998): `business_id`, `staff_id`, `title`,
  `description`, `date`, `start_time`, `end_time`, `location`,
  `meeting_link`, `attendees JSONB`, `agenda`, `notes`, `recording_url`,
  `status`. RLS uses the pre-080 pattern
  (`business_id IN (SELECT business_id FROM staff WHERE user_id = auth.uid())`)
  — tenant-safe but inconsistent with the canonical `get_current_staff()`.
- **No** meeting_participants, transcript, decisions, or actions tables exist.
  Attendees are a JSONB blob — no relational participant evidence, no
  join/leave timestamps, no attendance proof (section 12 unmet).

### Pages + components
- **Meetings.tsx** (1102 lines): schedule/invite/record/attend/summarize.
  Uses `MeetingComponents` (AttendeeSelector, AgendaBuilder,
  AttendanceTaker, MeetingRecorder, MeetingDetailHeader). Real
  `MediaRecorder` + `getUserMedia` recording → uploads to storage bucket
  `meeting-recordings`.
- **MeetingsV2.tsx** (361 lines): video-calling wrapper around `VideoRoom`
  (Jitsi). **DRIFT**: inserts `host_id` but the table has `staff_id` — the
  insert silently fails on a live DB (PostgREST drops unknown columns).
- **VideoRoom.tsx** (347 lines): Jitsi Meet iframe (`meet.jit.si`). This IS
  the clean media-provider abstraction section 5 requires — the rest of
  Avenize doesn't touch Jitsi directly. KEEP.
- **MeetingComponents.tsx** (557 lines): real recording UI (MediaRecorder),
  attendee/attendance/agenda builders.

### Edge functions
- **transcribe-audio** (232 lines): OpenAI Whisper (transcription) + GPT-4
  (summary). JWT-verified caller, service-role DB writes. This IS the AI
  processing boundary. EXTEND for decision/action extraction (Phase C).

### Storage
- **`meeting-recordings` bucket is MISSING.** Meetings.tsx uploads to it but
  no migration creates it. Recording upload fails silently. The existing
  bucket pattern (avatars/documents/signatures in 030/046/082/1001) is the
  template to reuse.

---

## B. Canonical systems to REUSE (section 2 non-negotiable)

| Capability | Canonical system | Migration | Meeting use |
|---|---|---|---|
| Auth/business/roles | `AuthContext` + `get_current_staff()` + `staff` | 001 | Meeting host/permissions |
| Invitations | `invites` + `create_invite`/`accept_invite` | 001 + 20260818330000 | Meeting invitations (extend with meeting token) |
| Notifications | `notifications` table + `send-email`/`send-email-notification` | 007/013/036 | Meeting reminders + post-meeting reports (section 21) |
| Tasks | `tasks` table | 004 | Action → task (section 20). NO second task system. |
| CRM | `contacts` / `deals` | 001/003 | Meeting ↔ customer/deal context (section 26) |
| Events/telemetry | `business_events` + `emit_business_event` | 058/059 | Meeting telemetry (section 31) |
| Decisions | `claims` (`claim_type='DECISION'`) | 060 | Meeting decisions (section 19). NO second decisions system. |
| Audit | `audit_row_change` triggers | 056 | Meeting audit trail (section 32) |
| Storage | `storage.buckets` pattern | 030/046/1001 | meeting-recordings bucket (CREATE — missing) |
| External guest auth | `signing_token` + anon RPC pattern | 043/050 | External meeting participants (section 11) |
| Scheduling | `events` table (TIMESTAMPTZ, recurrence, timezone) | 020 | Calendar integration foundation |

---

## C. Duplicate systems to AVOID

1. **No second task system** — meeting actions link to existing `tasks`, not a
   parallel `meeting_tasks` table. A `meeting_actions` linking table maps
   actions → task_ids.
2. **No second notification system** — reuse `notifications` + `send-email`.
3. **No second event bus** — reuse `business_events` / `emit_business_event`.
4. **No second decisions system** — reuse `claims` (`claim_type='DECISION'`).
5. **No parallel meeting table** — EXTEND the existing `meetings` table
   additively (new columns) + add the relational participant/media tables
   alongside. Per section 41: inspect, don't delete, preserve, migrate.
6. **No second media abstraction** — Jitsi (VideoRoom.tsx) IS the media
   provider. Keep it behind the component boundary.

---

## D. Required migrations (Phase A only)

One migration: `20260818400000_meeting_lifecycle_phase_a.sql`

### D1. Extend `meetings` table (additive — no breaking changes)
Add columns (all nullable, `ADD COLUMN IF NOT EXISTS`):
- `meeting_type TEXT DEFAULT 'internal'` (internal/external/recurring)
- `scheduled_start TIMESTAMPTZ` / `scheduled_end TIMESTAMPTZ` (replaces the
  lossy DATE+TIME pair — keep old columns for back-compat, populate new from
  old on first start)
- `actual_start TIMESTAMPTZ` / `actual_end TIMESTAMPTZ` / `duration_seconds INT`
- `recording_status TEXT DEFAULT 'none'` (none/requested/recording/available/failed)
- `transcript_status TEXT DEFAULT 'none'` (none/queued/processing/available/failed)
- `visibility TEXT DEFAULT 'business'` (business/participants/private)
- `created_by UUID REFERENCES staff(id)` (authoritative host — replaces the
  ambiguous `staff_id`; keep `staff_id` as back-compat alias)

### D2. `meeting_participants` (relational — replaces JSONB attendees)
```sql
CREATE TABLE meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id UUID,                         -- internal: auth.users id
  staff_id UUID REFERENCES staff(id),   -- internal: staff row
  guest_name TEXT,                       -- external guest display name
  guest_email TEXT,                      -- external guest email
  guest_token TEXT UNIQUE,               -- external: secure meeting token
  role TEXT DEFAULT 'participant',       -- host/co_host/participant/guest
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  total_seconds INT DEFAULT 0,
  status TEXT DEFAULT 'invited',         -- invited/joined/left/removed/declined
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (staff_id IS NOT NULL) OR (guest_token IS NOT NULL)
  )
);
```
RLS: `meeting_id IN (SELECT m.id FROM meetings m WHERE m.business_id IN (SELECT business_id FROM get_current_staff()))`.
Guest rows (no staff_id) are readable via the meeting's business scope.

### D3. `meeting_participant_events` (the evidence trail — section 12)
```sql
CREATE TABLE meeting_participant_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES meeting_participants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- invited/joined/left/rejoined/removed/muted/unmuted
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB
);
```
RLS: same business-scoped pattern.

### D4. `meeting_media` (recording metadata — section 6/14)
```sql
CREATE TABLE meeting_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'recording',  -- recording/transcript/capture
  storage_path TEXT,          -- private path (never a public URL)
  duration_seconds INT,
  size_bytes BIGINT,
  processing_status TEXT DEFAULT 'pending',  -- pending/processing/available/failed
  retention_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
RLS: business-scoped. Signed URLs only (section 13/32).

### D5. Storage bucket
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-recordings', 'meeting-recordings', false)
ON CONFLICT (id) DO NOTHING;
```
Private bucket. Access via signed URLs only (never `getPublicUrl` — the
existing Meetings.tsx uses `getPublicUrl`, a security gap to fix).

### D6. Lifecycle RPCs (SECURITY DEFINER, membership-guarded)
- `create_meeting(p_business_id, p_title, p_scheduled_start, p_scheduled_end, p_meeting_type, p_visibility)`
- `start_meeting(p_meeting_id)` — sets actual_start, status='live'
- `join_meeting(p_meeting_id, p_guest_token DEFAULT NULL)` — upserts
  participant, sets joined_at, emits participant_event 'joined'
- `leave_meeting(p_meeting_id, p_participant_id)` — sets left_at, computes
  total_seconds, emits 'left'
- `end_meeting(p_meeting_id)` — sets actual_end, duration_seconds, status='completed'
- `generate_meeting_token(p_meeting_id, p_guest_email)` — creates a guest
  participant + token (section 11 external guests)

All verify `business_id IN (SELECT business_id FROM get_current_staff())`.

### D7. Fix meetings RLS (use canonical helper)
Drop + recreate the 4 meetings policies to use `get_current_staff()`
(matches the 080 repair pattern for the other 111 policies).

### D8. Telemetry (section 31)
Meeting lifecycle RPCs call `emit_business_event` (reuse 058/059 — NOT a new
event system) for: `meeting_created`, `meeting_started`, `meeting_joined`,
`meeting_ended`.

---

## E. Media infrastructure boundary (section 5)

```
Avenize Meeting Service (this migration)
  ├── Meeting lifecycle (create/start/join/leave/end RPCs)
  ├── Authorization (get_current_staff + guest tokens)
  ├── Business context (meetings.business_id)
  ├── Evidence (participant_events, media metadata)
  └── Execution boundary
          │
          ↓
  Media Infrastructure
  Video/Audio/RTC → Jitsi Meet (VideoRoom.tsx, existing)
  Recording → MediaRecorder API → meeting-recordings bucket (private)
```

- Jitsi (meet.jit.si) is the existing media provider, behind `VideoRoom.tsx`.
  The rest of Avenize doesn't touch Jitsi directly. This satisfies section 5.
- For Capture (Loom-style, section 15): browser `MediaRecorder` API (already
  in `MeetingComponents`). No external provider needed.
- No raw WebRTC infrastructure is built (section 5: do not build Zoom-scale
  media infra from scratch).

---

## F. AI processing boundary (section 17-20)

- `transcribe-audio` edge function (existing) is the boundary: Whisper for
  transcript, GPT-4 for summary. JWT-verified caller, service-role DB writes.
- Phase C will EXTEND this function (or add a sibling) for decision/action
  extraction. It will write to `claims` (DECISION) + `meeting_actions` — NOT
  a new decisions/actions system.
- AI must distinguish explicit/implied/inferred/uncertain (section 19) — this
  maps to the existing `claims.confidence` + `claim_type` taxonomy.
- Phase A does NOT touch AI. It establishes the evidence structure that AI
  will later populate.

---

## G. UI routes

| Route | Phase | Notes |
|---|---|---|
| `/app/meetings` | A (existing, consolidate) | Merge Meetings + MeetingsV2 into one canonical page. Fix host_id drift. |
| `/app/meetings/:id` | A | Meeting detail + evidence trail (section 12) |
| `/app/meetings/:id/room` | A | Live room (VideoRoom/Jitsi) with connection-state UX |
| `/app/meetings/:id/transcript` | C | Deferred |
| `/app/capture` | B | Loom-style async recording (deferred) |
| `/app/meetings/:id/report` | D | Post-meeting distribution (deferred) |

Phase A consolidates the two existing routes (`meetings` + `meetings-new`)
into one canonical `/app/meetings`. `meetings-new` becomes a redirect.

---

## H. Risks

1. **Two competing meeting pages** (Meetings 1102 lines + MeetingsV2 361
   lines). Must consolidate — risk of losing working features in the merge.
   Mitigation: Phase A keeps both files but routes `meetings-new` → redirect
   to `meetings`; the canonical page is enhanced incrementally.
2. **`meeting-recordings` bucket missing** — existing recording uploads fail
   silently. Phase A creates the bucket. Existing recordings (if any on live
   DB) are unaffected (the bucket creation is additive).
3. **Meetings.tsx uses `getPublicUrl`** for recordings (section 32 violation).
   Phase A does not change this (it's a Phase B recording work item) but the
   new `meeting_media` table stores `storage_path` (private) and the
   recording-access path will use signed URLs.
4. **Jitsi free server (meet.jit.si)** has no SLA / no recording API. For
   recording, we use client-side MediaRecorder (already implemented). For
   server-side recording (future), a self-hosted Jitsi or a paid provider
   would be needed — but that's a capacity decision, not an architectural one.
5. **Live-DB deployment drift** — like all migrations 080+, this won't take
   effect until applied to the live Supabase. Frontend degrades gracefully
   (best-effort, non-blocking per §24).

---

## I. Implementation phases (section 43)

| Phase | Scope | Status |
|---|---|---|
| **A** | Meeting lifecycle + room + participant evidence | **This session** |
| B | Recording + capture (Loom-style async) | Deferred |
| C | Transcript + summary + decisions + actions | Deferred |
| D | Tasks + notifications + follow-through (post-meeting report) | Deferred |
| E | Analytics + meeting productivity intelligence | Deferred |
| F | Advanced collaboration + enterprise controls | Deferred |

Phase A delivers:
1. Extended `meetings` table (lifecycle columns).
2. `meeting_participants` (relational, with join/leave evidence).
3. `meeting_participant_events` (the evidence trail).
4. `meeting_media` (recording metadata, private paths).
5. `meeting-recordings` storage bucket (private).
6. Lifecycle RPCs (create/start/join/leave/end + guest token).
7. Fixed meetings RLS (get_current_staff pattern).
8. Telemetry via existing `emit_business_event`.
9. Consolidated UI route (`/app/meetings` canonical, `meetings-new` redirect).

Phase A does NOT deliver:
- Recording/capture UI (Phase B — existing MeetingRecorder + new Capture page).
- Transcript/summary/decisions/actions (Phase C — transcribe-audio extension).
- Task creation from actions (Phase D — tasks table reuse).
- Analytics (Phase E).

---

## J. Definition of done for Phase A

Per section 44, the full path must work. Phase A's path is:
```
User → authenticated → authorized → creates meeting → invites participants →
participants join → attendance is recorded → meeting ends → evidence trail exists.
```
The video/audio room itself is the existing Jitsi VideoRoom (unchanged).
Phase A adds the LIFECYCLE + EVIDENCE layer around it.

Verification: tsc clean, vite build 0 warnings, vitest pass, migration applies
clean + idempotent against postgres:15, RLS verified, schema-drift 0.
