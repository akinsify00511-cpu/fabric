# AVENIZE MEETING SYSTEM ARCHITECTURE

**Status:** Target architecture + verified current-state gap analysis. **Version:** 1.0 (2026-08-24)
**Hierarchy position:** Subordinate to `docs/constitution/AVENIZE_PRODUCT_CONSTITUTION.md`,
`docs/constitution/AVENIZE_EXCELLENCE_CONSTITUTION.md`, and
`docs/architecture/AVENIZE_MASTER_PRODUCT_ARCHITECTURE.md`. Extends `docs/domains/MEETINGS.md`;
supersedes the planning parts of `MEETING_ARCHITECTURE_IMPACT_REPORT.md`.
**Verified against:** repository tree at origin/main `27fb2ac` (2026-08-24). Every "current state"
claim below was established by reading the tree, not from session memory (Product Constitution,
Article I).

---

## 1. Product Principle

A meeting is **business intelligence input**, not an isolated communication feature. The
**meeting record is the central object**: scheduling, the live session, capture, and the
post-meeting outcome are all views and append operations on ONE record — never separate
disconnected pages.

The user experiences **one Meeting workspace**, not a set of meeting-flavored pages:

```text
Meetings
   │
   ├── Schedule          (title, agenda, participants, CRM context, reminders)
   ├── Join              (lobby: device check, permissions, preview)
   ├── Live Meeting
   │     ├── Video       (camera, participant grid, active speaker, screen share)
   │     ├── Audio       (mic, speaker, levels, mute, connection state)
   │     ├── Chat/Text   (native meeting chat, persisted against the meeting record)
   │     ├── Participants(roster, join/leave evidence)
   │     └── Controls    (mic, camera, screen, record, end)
   ├── Capture           (INSIDE the live meeting — never a separate app)
   │     ├── Recording
   │     ├── Transcript
   │     ├── Notes
   │     ├── Decisions
   │     └── Action items
   └── After Meeting
         ├── Summary     (duration, participants, messages, captures)
         ├── Review → Edit → Assign → Save
         ├── Action items → real tasks
         ├── Decisions → claims (outcome loop)
         ├── Follow-ups → notifications
         └── Business intelligence (CRM, objectives, analytics)
```

The canonical flow is `Meetings → select meeting → Join → conduct meeting → Capture → Finish →
Meeting record`. It is never `Meetings → leave Meetings → go to Capture → somehow reconnect`.
(The `/app/capture → /app/meetings` redirect already encodes this decision; this document makes
the rest of the system match it.)

## 2. The Canonical Meeting Journey (Excellence Constitution, Article I)

| Step | Entry | Business outcome | Acceptance evidence |
|---|---|---|---|
| Schedule | "New meeting" | Meeting row + participant invites + reminder schedule | invitee notified; meeting listed |
| Join | "Join in Avenize" | Participant evidence written; media session live | `meeting_participants.joined_at` set |
| Live | in-room | Real video + audio + chat between ≥2 users | two-browser acceptance test (§10) |
| Capture | in-room | Typed captures persisted against the meeting ID | capture visible after refresh |
| End | "End" | Post-meeting record assembled; room torn down cleanly | summary roll-up rendered |
| Follow-up | post-meeting | Decisions→claims, actions→tasks, follow-ups→notifications | outcome loop rows exist |
| Business context | CRM/objectives | Meeting linked to customer/deal/objective; contributes to analytics | links visible on both sides |

**The journey is currently INCOMPLETE** (gaps in §4). Per the Excellence Constitution, the
Meetings journey must not be claimed complete until every row above has acceptance evidence.

## 3. Verified Current State (origin/main `27fb2ac`)

### 3.1 What exists and is real

- **Native WebRTC room** (`src/pages/MeetingCapture.tsx`, route `/app/meeting-capture?meeting=<id>`):
  real `getUserMedia` camera/microphone, `RTCPeerConnection` mesh, signaling over a Supabase
  Realtime private channel (`meeting:<id>`, broadcast + presence), screen share via
  `getDisplayMedia`, mic/camera toggles, `MediaRecorder` recording → private `meeting-captures`
  bucket, and a capture tray (text note, Web Speech voice capture, ≤10MB attachments) writing to
  `meeting_captures`. End meeting sets status `completed` and returns to the list.
- **Scheduling surface** (`src/pages/Meetings.tsx`): list / create / detail / edit with attendee
  selection + agenda builder; "Join in Avenize" deep link into the room.
- **Schema (all applied-clean + idempotent in CI):**
  - `20260818400000` Phase A — lifecycle: `meeting_participants` (staff OR guest_token),
    `meeting_participant_events` (append-only evidence), `meeting_media`, and the membership-guarded
    RPCs `create_meeting / start_meeting / join_meeting / leave_meeting / end_meeting /
    generate_meeting_token`.
  - `20260818500000` Phase B — recording/capture RPCs (`create_recording_upload_path`,
    `finalize_recording`, `generate_recording_signed_url` — the membership auth gate).
  - `20260818600000` Phase C — `meeting_transcripts` + `transcript_segments` (GIN FTS),
    `meeting_summaries`, `meeting_decisions` (4-status), `meeting_actions` (5-status → real
    `tasks`), `save_transcript`, `save_meeting_decisions`, `create_action_task`,
    `get_meeting_intelligence`, `search_transcripts`.
  - `20260818700000` Phase D — `meeting_reports` (immutable snapshots) + `generate_meeting_report`.
  - `20260818800000` + `20260821140000/142000` Phase E — `meeting_analytics`.
  - `20260820210000` native meetings — `meetings` RLS via `get_current_staff()`, `meeting_captures`
    (staff_id shape), private `meeting-captures` bucket with membership-keyed storage RLS,
    `realtime.messages` RLS for `meeting:<id>` topics (membership-gated), `set_avenize_meeting_room()`.
  - `20260822140000_governance_meeting_scheduling` — board/committee meetings reuse this lifecycle
    (a 9-arg `create_meeting` overload; no parallel meeting system).
- **Intelligence surfaces:** `MeetingIntelligenceView`, `MeetingReportView`,
  `MeetingAnalyticsView` pages exist and consume the Phase C/D/E RPCs.
- **Capture is no longer a disconnected app:** `/app/capture` is a pure redirect to
  `/app/meetings`; `AICapture.tsx` is that redirect only.

### 3.2 Verified gaps (the journey is broken at these points)

- **G1 — The live pages bypass the canonical lifecycle.** `Meetings.tsx` inserts directly into
  `meetings` with the legacy JSONB `attendees` blob; `MeetingCapture.tsx` flips `status` with
  direct updates. `create_meeting/start_meeting/join_meeting/leave_meeting/end_meeting` are only
  referenced by `src/lib/businessOS.ts` — no live page calls them. Consequence:
  `meeting_participants` and `meeting_participant_events` are never written by the real flow; the
  participant evidence the schema exists to capture is absent; guest tokens are unusable.
- **G2 — No native meeting chat.** The room's side panel is a capture tray, not chat. There is no
  `meeting_chat` table, no real-time message exchange, no persistence, no unread state, no
  meeting-scoped message permissions. This is a fundamental communication mode missing from the
  live experience.
- **G3 — No post-meeting record.** Ending a meeting produces "status completed" and a redirect —
  not the Meeting-completed roll-up (duration, participants, messages, notes, decisions, action
  items) and not the Review → Edit → Assign → Save flow.
- **G4 — Captures are untyped free text.** `capture_type` is `text/voice/image/file/recording` —
  there is no decision / action-item / follow-up type, no owner, no due date, and no path from a
  live capture to `claims` (decision) or `tasks` (action item). The Phase C RPCs that model this
  are not wired into the room.
- **G5 — No transcription executor.** The `transcribe-audio` edge function (Whisper + GPT
  extraction) no longer exists in `supabase/functions/`. The Phase C transcript/summary/decision
  tables and RPCs exist, but nothing populates them from a recording. In-room voice capture uses
  the browser Web Speech API only, with no server-side transcript of record.
- **G6 — Business integration absent in the live flow.** No customer/lead/deal association at
  schedule time or in-room; no objective linkage; notifications are ad-hoc direct inserts
  (invite/remind only) — there is no before/at-start/during/after/follow-up notification journey.
- **G7 — Meeting history is a partial object.** The detail view shows title/date/agenda/attendee
  count, but does not assemble the full record (participants with evidence, chat, recording,
  transcript, notes, decisions, action items, attachments, related business records).
- **G8 — Media robustness gaps.** No camera/mic/speaker selection, no audio-level indication, no
  connection-state surfacing (peers close silently on failure), no reconnection logic, and
  permission denial is a single toast with no recovery path. Refresh/rejoin behavior is
  undesigned (presence re-join works by accident, not by contract).
- **G9 — Migration-number collision — RESOLVED (commit d234222):** the duplicate
  `20260822140000` (contract_scan_extension + governance_meeting_scheduling) was fixed by
  renumbering the governance file to `20260822141000`. No action remains.

### 3.3 Explicitly retained decisions

- **Media transport: native WebRTC mesh over Supabase Realtime signaling** (Jitsi was removed).
  The transport MUST sit behind a `MediaSession` abstraction boundary so the rest of the system
  never touches WebRTC APIs directly — a future SFU (for larger rooms) is a transport swap behind
  that boundary, not a rewrite. Mesh is honestly capped (≲8–12 participants); beyond that the UI
  must degrade deliberately (audio-first + active-speaker video), never silently break.
- **No parallel systems** (Product Constitution, Article III): decisions → `claims`, action items
  → `tasks`, alerts → `notifications`, telemetry → `business_events`, storage → private bucket +
  signed URLs. The meeting system composes; it never duplicates.

## 4. Target Architecture

### 4.1 The Meeting Workspace (one surface)

```text
┌─────────────────────────────────────────────────────────┐
│  Meeting title · duration · connection state · End      │
├──────────────────────────────┬──────────────────────────┤
│                              │  Tabs: Chat | Capture |  │
│        VIDEO GRID            │         People           │
│   (active-speaker aware,     │                          │
│    screen-share promoted)    │  chat: persisted,        │
│                              │  meeting-scoped          │
│                              │                          │
│                              │  capture: typed entries  │
│                              │  (note/decision/action/  │
│                              │   follow-up/recording)   │
├──────────────────────────────┴──────────────────────────┤
│ 🎤 mic  📹 camera  🖥 share  ⏺ record  🔊 speaker  ⚙  ⏹ │
└─────────────────────────────────────────────────────────┘
```

Communication and capture happen in the same workspace. The user never leaves the meeting to
capture, and never leaves the meeting to chat.

### 4.2 Component map

| Component | Responsibility | Notes |
|---|---|---|
| `MeetingWorkspace` | Shell/orchestrator: lifecycle state, layout, tab state | Replaces the current room page; route stays `/app/meeting-capture?meeting=<id>` (or moves to `/app/meetings/:id/room` with a redirect) |
| `MediaSession` | The ONLY module touching `getUserMedia`/`RTCPeerConnection`/signaling | Provider boundary: devices, tracks, peers, connection state, reconnect. Mesh today; SFU-pluggable tomorrow |
| `ParticipantLayer` | Roster + join/leave evidence via lifecycle RPCs | Writes `meeting_participants` / `meeting_participant_events`; presence is UX, evidence is DB |
| `MeetingChat` | Real-time text, persisted against the meeting | Broadcast for delivery, DB for record (§5) |
| `CapturePanel` | Typed in-meeting capture (note/decision/action/follow-up) + recording + transcript status | Every entry lands on the meeting record |
| `PostMeetingRecord` | End-of-meeting roll-up + Review→Edit→Assign→Save | The journey's business-outcome step |

### 4.3 The three fundamental communication modes

**Video:** camera on/off; camera selection (`enumerateDevices` + `deviceId` constraint);
participant grid; active-speaker promotion; screen share as a first-class tile; join/leave
tile lifecycle; per-peer connection state; camera-failure tile state (honest "camera
unavailable", never a black box presented as video).

**Audio:** mic on/off; microphone + speaker selection; audio-level indication
(`AudioContext`/`AnalyserNode` on local + remote streams); connection state; permission handling
with a designed recovery path (denied → clear explanation + how to re-enable + join
audio-less option); device-failure handling (device unplugged mid-call → re-enumerate + recover).

**Text (native meeting chat):** send/receive in real time; participant identity + timestamps;
unread indicator on the Chat tab while viewing Capture; messages persist against the meeting
record (§5); meeting-scoped permissions (only meeting participants can read/write); mention
support where appropriate. This is meeting chat, NOT the general team chat — but it reuses the
team chat's patterns, never a fork of them (Article III).

### 4.4 Capture produces structured business data

Capture during the meeting is **typed**, because a meeting is where commitments are made:

| Capture type | Lands as | Canonical system |
|---|---|---|
| Note | `meeting_captures` (typed) / meeting notes | meeting record |
| Decision | `meeting_decisions` (+ link to `claims`) | decision register → outcome loop |
| Action item | `meeting_actions` → real `tasks` row (`create_action_task`) | tasks (004) |
| Follow-up | task + scheduled notification | tasks + notifications |
| Recording | `meeting_media` + private bucket object | recording pipeline (Phase B) |
| Transcript | `meeting_transcripts` + `transcript_segments` | transcript pipeline (Phase C) |
| Attachment | `meeting_captures` + private bucket object | storage |

The canonical requirement (the standard to match): when a participant says **"Client wants
delivery by September"**, the system can turn it into **Decision:** delivery required by
September; **Action:** confirm production schedule; **Owner:** Operations; **Due date:**
September 1 — and associate it as `Customer → Meeting → Action → Task`. AI extraction may
propose, but the human confirms before anything becomes a business record (Product
Constitution, Article V: AI INFERRED ≠ USER CONFIRMED).

### 4.5 After the meeting

"End Meeting" never just shows "Meeting ended." It produces the **post-meeting record**:

```text
Meeting completed
Duration: 48 minutes · Participants: 5 · Messages: 34
Notes: 12 · Decisions: 3 · Action items: 7

Avenize captured: 3 decisions · 7 action items · 2 follow-ups · 4 important topics
[ Review → Edit → Assign → Save ]
```

Review lets the host edit captures, assign action items to real owners with due dates, and
save — at which point decisions flow to `claims`, actions to `tasks`, follow-ups to
notifications. The meeting then appears in history as a complete data object (§5).

### 4.6 Meeting history — the meeting as a real data object

```text
Meeting
├── Meeting ID · Organization · Business · Organizer
├── Participants (with join/leave evidence)
├── Date/time · Duration · Meeting type · Status
├── Video/audio session metadata
├── Chat (persisted messages)
├── Recording · Transcript · Notes
├── Decisions · Action items · Attachments
└── Related business records (customer, lead, deal, quote, tasks, objective)
```

The meeting detail view assembles this object in one place (the existing
`get_meeting_intelligence` RPC is the composition root — extended, not replaced).

## 5. Data Architecture

### 5.1 Existing entities (verified — reuse, extend additively)

`meetings` (extended by 184/210: lifecycle, type, visibility), `meeting_participants`,
`meeting_participant_events`, `meeting_media`, `meeting_captures`, `meeting_transcripts` +
`transcript_segments`, `meeting_summaries`, `meeting_decisions`, `meeting_actions`,
`meeting_reports`.

### 5.2 New entities required

- **`meeting_chat_messages`** — id, meeting_id (FK, cascade), business_id, sender staff_id OR
  guest_token (same one-or-the-other CHECK as participants), body, created_at, edited_at.
  RLS: meeting participants only (via `get_current_staff()` membership + meeting business).
  Delivery via the existing `meeting:<id>` realtime channel for latency; the table is the
  record of truth (send = insert; broadcast fan-out or postgres_changes subscription).
- **Business-context links** — additive, not a new link-table empire: `meetings.contact_id`,
  `meetings.deal_id`, `meetings.lead_id`, `meetings.objective_id` (nullable FKs, additive
  `ADD COLUMN IF NOT EXISTS`), surfaced at schedule time and in-room. (If multi-entity linking
  proves necessary, ONE `meeting_entity_links` table — never per-entity tables.)
- **Typed captures** — extend `meeting_captures.capture_type` CHECK with
  `decision/action_item/follow_up`, plus nullable `assignee_staff_id`, `due_date`,
  `linked_task_id`, `linked_claim_id` (the capture → business-data bridge).

### 5.3 Ownership rules

One concept, one table (Article II): chat about a meeting lives ONLY in
`meeting_chat_messages`; decisions ONLY in `meeting_decisions`/`claims`; actions ONLY in
`meeting_actions`/`tasks`. JSONB `attendees` on `meetings` is deprecated in favor of
`meeting_participants` (M1 migrates; the column stays readable for back-compat until consumers
move).

## 6. Lifecycle & State Machines

- **Meeting:** `scheduled → in_progress → completed | cancelled`. Transitions through the
  lifecycle RPCs ONLY (server is authoritative; direct status updates from the client are a
  G1-class violation).
- **Participant:** `invited → joined → left | declined | removed`. `join_meeting` is idempotent
  (re-join after refresh updates nothing twice; evidence events are append-only).
- **Media connection (per peer):** `connecting → connected → reconnecting → failed → closed`.
  Surfaced in the UI; `failed` triggers renegotiation before teardown.
- **Recording:** `none → recording → processing → available | failed` (failed keeps the blob for
  retry — existing Phase B contract).
- **Refresh/reconnect contract:** a refresh re-joins via `join_meeting` (idempotent), rehydrates
  chat + captures from the DB (the record, not presence), re-subscribes the channel, and
  re-negotiates peers. A refresh NEVER corrupts the meeting or duplicates evidence.

## 7. Integration Contracts

1. **Meeting → CRM:** schedule can associate a contact/lead/deal; the room header shows the
   customer context; post-meeting "Create quote" / "Log follow-up" actions deep-link into the
   demand-capture chain (`lead_requests` → `quotes` → `sales_orders`). The commercially
   valuable chain is: `Lead → Meeting → Conversation → Decision → Follow-up → Quote → Order`.
2. **Meeting → objectives:** action items and decisions from meetings roll into objective
   progress where linked (meeting→objective association; the objective gap-analysis RPCs stay
   the computation authority).
3. **Meeting → notifications (the "hold their hand" journey):** before ("Meeting in 15
   minutes"), at start ("Your meeting is ready"), during (significant events only — anti-spam),
   after ("Meeting captured successfully"), follow-up ("You have 4 action items from today's
   meeting"). All through the canonical `notifications` + email queue — never ad-hoc inserts.
4. **Announcements ≠ notifications:** "New: Meeting transcription" is an announcement (product
   news surface); "Your meeting starts in 10 minutes" is a notification. The systems stay
   separate but connected.
5. **Meeting → analytics/BI:** lifecycle RPCs emit `business_events`; `meeting_analytics`
   consumes the record (waste detection, completion %, per-staff load) with the small-sample
   honesty guard.
6. **Meeting → tasks/claims:** via `create_action_task` / `meeting_decisions` only — no parallel
   task or decision stores.

## 8. Security & Permissions

- Join is **server-verified membership** (`join_meeting` guards; the realtime topic RLS in
  `20260820210000` is the transport boundary — both layers stay).
- External guests join via single-purpose meeting tokens (`generate_meeting_token`), scoped to
  the meeting, revocable, with guest identity captured (`guest_name`).
- Recordings/attachments stay in the PRIVATE bucket; playback via membership-verifying
  signed-URL RPCs. `getPublicUrl` on a meeting bucket is a constitutional violation (Article
  IV.4).
- Chat RLS: meeting participants only; guests see only their meeting's messages.
- Board/committee meetings respect the governance visibility boundary (aggregate-only board
  reporting; the report functions never reference PII/payroll — construction-based boundary).
- `SECURITY DEFINER` meeting RPCs with a business/meeting parameter verify membership
  (`get_current_staff()`); guest RPCs verify the token and nothing else.

## 9. Failure & Recovery Matrix

| Failure | Required behavior |
|---|---|
| Camera/mic permission denied | Designed recovery screen: what happened, how to re-enable per browser, "join without video/audio" path. Never a bare toast. |
| Device unplugged mid-call | `devicechange` → re-enumerate → recover or honest degraded state. |
| Network interruption | Connection state surfaces immediately; auto-resubscribe + renegotiate; chat/capture draft state preserved locally and re-sent. |
| Refresh mid-meeting | §6 refresh contract — rejoin idempotently, rehydrate from the record. |
| Recording upload failure | Blob retained; honest `failed` status; single-click retry (existing contract). |
| Transcription unavailable | Honest "transcript not available"; recording + notes unaffected (never blocks the meeting). |
| Extraction failure | Non-fatal; captures remain as entered (null-don't-fabricate contract). |
| Mesh participant limit reached | Deliberate degrade to audio-first + active-speaker video with an honest notice. |
| RPC/migration not yet deployed | Best-effort degradation: room still works, evidence/intelligence panels show honest empty states (Article VI). |

## 10. Acceptance Tests (the contract — Excellence Constitution, Article V)

The Meetings journey is complete ONLY when this suite passes against real infrastructure
(two real browser sessions for media tests):

1. Two users can join the same meeting.
2. Both can see each other's video (camera permission → stream → remote render).
3. Both can hear each other's audio.
4. Both can mute/unmute (self + reflected remotely).
5. Screen share is visible to the other participant.
6. Participant A sends a chat message → B receives it in real time → it persists in the meeting
   record and is visible after refresh.
7. Capture (note/decision/action) persists and appears in the post-meeting record.
8. Recording (where supported) uploads to the private bucket and plays back via signed URL.
9. Meeting ends correctly for all participants; status + duration are recorded.
10. Meeting history displays the full record (participants, chat, captures, recording,
    decisions, actions).
11. The related CRM record (customer/deal) is preserved and visible on both sides.
12. Notifications fire: reminder before, capture-summary after, action-item follow-up.
13. Refresh/reconnect does not corrupt the meeting or duplicate participant evidence.
14. Permission denial has a usable recovery path (video/audio-less join works).
15. Network interruption has a usable recovery path (auto-reconnect, no data loss).

Mapping: 1–5, 13–15 → e2e (Playwright, two contexts); 6–10 → integration (real Postgres +
realtime fixtures); 11–12 → integration + probe; the whole suite runs in CI before the journey
may be called complete.

## 11. Definition of Done (Meetings journey)

- [ ] Every §2 journey row has acceptance evidence (§10 suite green).
- [ ] Live pages drive the lifecycle RPCs exclusively (G1 closed).
- [ ] Native chat persists and is meeting-scoped (G2 closed).
- [ ] End produces the post-meeting record with Review→Edit→Assign→Save (G3 closed).
- [ ] Captures are typed; a decision/action from a meeting becomes a claim/task (G4 closed).
- [ ] Transcription executor restored or honestly descoped (G5 closed).
- [ ] CRM/objective/notification contracts wired (G6 closed).
- [ ] Meeting history assembles the full object (G7 closed).
- [ ] Media robustness: device selection, levels, connection state, reconnect, permission
      recovery (G8 closed).
- [x] Migration-number collision resolved (G9 closed — commit d234222).
- [ ] Zero console errors in normal operation; design-constitution PASS; schema-drift 0;
      contract manifest regenerated.

## 12. Phased Closure Plan (backend first, frontend second, connect, test, commit)

- **M1 — Lifecycle compliance.** Room + scheduler call `create/start/join/leave/end_meeting`;
  participants + evidence written; `attendees` JSONB migrated/deprecated; the G9
  renumber landed separately in d234222. Migration + page changes + lifecycle tests.
- **M2 — Native meeting chat.** `meeting_chat_messages` + RLS + realtime delivery + Chat tab
  (unread state, identity, timestamps) + persistence/rehydration. Acceptance: §10.6.
- **M3 — Structured capture + transcription path.** Typed captures (decision/action/follow-up +
  assignee/due/linked rows); capture→task/claim actions; restore a transcription executor
  (edge function, behind the same null-don't-fabricate contract) or honestly descope transcript
  to "where supported". Acceptance: §10.7–8.
- **M4 — Post-meeting record.** End-of-meeting roll-up + Review→Edit→Assign→Save + full meeting
  history object view. Acceptance: §10.9–10.
- **M5 — Business integration.** CRM association at schedule/in-room; post-meeting CRM actions;
  objective linkage; the notification journey; announcement/notification separation.
  Acceptance: §10.11–12.
- **M6 — Media hardening + acceptance gate.** Device selection, audio levels, connection-state
  UI, reconnect, refresh contract, permission-recovery screens, mesh-limit degrade, captions via
  transcript. Full §10 suite wired into CI as a permanent regression gate.

Each phase leaves the app stable and green (tsc, build, vitest, schema-drift,
design-constitution, migration chain) before the next begins.

## 13. Anti-Patterns (constitutional violations in this domain)

- A UI card or tab claiming video/audio/transcript/chat that has no working behavior behind it
  (Excellence Constitution, Article I.5).
- A capture surface outside the meeting workspace, or a second capture app.
- Direct client writes to `meetings.status` or participant rows instead of the lifecycle RPCs.
- A parallel chat/task/decision/notification store "just for meetings".
- `getPublicUrl` on the `meeting-captures` / `meeting-recordings` buckets.
- Presence (ephemeral) used as the participant record of truth — presence is UX; evidence is DB.
- Marking the Meetings journey "complete" on the strength of pages existing.
