# DOMAIN: MEETINGS

> **Target architecture + verified gap list:** see
> `docs/architecture/AVENIZE_MEETING_SYSTEM_ARCHITECTURE.md` (v1.0, 2026-08-24). As of
> origin/main `27fb2ac` the Meetings journey is **INCOMPLETE** (Excellence Constitution,
> Article I): the native WebRTC room and capture tray are real, but the live pages bypass the
> lifecycle RPCs (G1), there is no native meeting chat (G2), no post-meeting record (G3),
> captures are untyped (G4), the transcription executor is absent (G5), business integration
> is unwired (G6), meeting history is partial (G7), media robustness is undesigned (G8), and
> the 20260822140000 migration-number collision is unresolved (G9). Closure plan: M1–M6 in the
> target architecture. The specification below describes the domain contract to reach.

**Purpose:** a complete meeting product — schedule, lobby, video/audio, participants,
chat, agenda, capture, transcript, decisions, actions, report, analytics — as ONE
domain. Capture belongs naturally inside it (see CAPTURE.md), never a detached app.

**Responsibilities:** lifecycle (create/start/join/leave/end), participant evidence,
external guests (token), recording (private bucket + signed URLs), async captures,
transcription + summary + decisions/actions extraction, post-meeting report,
cross-meeting analytics.

**Entities:** meetings, meeting_participants (staff_id OR guest_token),
meeting_participant_events (append-only evidence), meeting_media, meeting_captures,
meeting_transcripts + transcript_segments (GIN FTS), meeting_summaries,
meeting_decisions (4-status), meeting_actions (5-status → real tasks),
meeting_reports (immutable snapshots).

**States:** meeting scheduled → in_progress → completed/cancelled; participant
invited → joined → left; recording pending → available/failed → expired; decision
proposed → decided → reversed/superseded (reversed stays visible — audit).

**User flows:** create → invite (internal or guest token link) → join lobby →
Jitsi video room → record → transcribe → intelligence view (summary/decisions/
actions/transcript search) → generate report (notifies attendees) → analytics.

**Permissions:** all lifecycle RPCs membership-guarded; guest join via generated
token (single-purpose); signed-URL generation verifies membership server-side.

**Database:** 20260818400000 (Phase A lifecycle), 18500000 (recording/capture),
18600000 (transcript/decisions/actions), 18700000 (reports), 18800000 (analytics),
20260822140000 governance meeting scheduling (board meetings reuse this lifecycle —
no parallel meeting system).

**APIs:** create_meeting, start_meeting, join_meeting, leave_meeting, end_meeting,
generate_meeting_token, create_recording_upload_path, finalize_recording,
generate_recording_signed_url, save_transcript, save_meeting_decisions,
create_action_task, get_meeting_intelligence, search_transcripts,
generate_meeting_report, meeting_analytics.

**Events:** lifecycle RPCs emit business_events; meetings.scheduled platform event.

**Notifications:** attendee notifications on explicit report generation only
(anti-spam — not on every transcript refresh).

**Analytics:** meeting_analytics (totals, completion % — NULL when no actions,
wasted-meeting detection, per-staff load; small-sample caution < 5 meetings).

**AI interaction:** Whisper transcription + GPT extraction (decisions/actions) with
the null-don't-fabricate contract; extraction failure is non-fatal.

**Failure states:** recording upload fails → honest failed status + retry; transcript
unavailable → honest "not available"; Jitsi blocked → lobby/chat still work.

**Recovery:** expire_recordings retention sweeper; failed captures keep blobs for
single-click retry.

**Security:** recordings bucket PRIVATE; never getPublicUrl; board visibility
boundary respected in scheduling.

**Accessibility:** lobby controls labeled; chat keyboard-operable; captions via
transcript.

**Performance:** intelligence view is ONE get_meeting_intelligence call; analytics
aggregate server-side.

**Tests:** meetingLifecycle (18), meetingRecordingCapture (14),
meetingTranscriptDecisions (16), meetingReport (13), meetingAnalytics (14).

**Definition of Done:** the full create→join→capture→process→actions chain works
with evidence, and a meeting outcome becomes a tracked task + claim (outcome loop).
