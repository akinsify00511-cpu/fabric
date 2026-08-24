# DOMAIN: CAPTURE

**Purpose:** multimodal quick capture — text, voice, image, file — that flows into
structured business records through the event bus. Capture is part of the meeting
and work fabric, not a detached page.

**Pipeline:**

```text
Meeting / standalone capture
 → Capture (text | voice | image | file)
 → Transcript / OCR (system-captured)
 → Extraction (AI-inferred, null-don't-fabricate)
 → USER CONFIRMS (AI inference never silently becomes fact)
 → emit_business_event → handler_propagate_capture (real writes)
 → entity link (deal/customer/invoice/staff/task)
```

**Entities:** capture_attachments (kind/mime/size/status/transcript/ocr_result),
capture-attachments bucket (PRIVATE), business_events (the propagation vehicle),
receipt_documents (the receipt-specific capture flow).

**States:** attachment pending → available/failed; capture_mode =
natural_language/voice/image/file; provenance labels: USER ENTERED / SYSTEM CAPTURED /
AI INFERRED / USER CONFIRMED.

**User flows:** AICapture page (type/dictate/snap/attach) → parse-intent → review →
confirm (blocked while uploads in-flight — no false partial commits); voice flow
(permission-specific errors, editable transcript of record); image flow (preview →
validate → client-side compress → confirm, shows "12.4MB → 890KB"); receipt flow
(in-browser OCR → editable review → Confirm records the expense, idempotently).

**Permissions:** create_capture_attachment (membership-guarded, server-side caps:
image ≤15MB, audio ≤50MB, file ≤25MB document allowlist); link RPCs verify both rows
belong to the caller's business; signed-URL gate verifies membership.

**Database:** 20260819050000 (capture attachments), 20260819020000 (receipt OCR).

**APIs:** create_capture_attachment, finalize, generate_capture_attachment_url,
link_capture_to_event, link_capture_to_entity, save_capture_transcript,
save_capture_ocr, list_capture_attachments, delete_capture_attachment;
capture-process edge fn (transcribe/ocr; JWT + membership verified before
service-role use); parse-intent edge fn.

**Events:** confirm emits business_events with _attachment_ids; capture_mode recorded.

**Notifications:** downstream destination notifications via canonical notifications.

**Analytics:** capture usage feeds feature activation metrics.

**AI interaction:** Whisper (voice), GPT-4o-mini vision (OCR), parse-intent (routing);
all under the anti-fabrication contract; Whisper failure offers Web Speech fallback
then type-manually.

**Failure states:** upload fails → retry (blob kept); OCR garbage → nulls, honest
review; create path RPC missing → honest "upload setup failed" state.

**Recovery:** cancel discards the uploaded row (no orphans); delete returns the
storage path for cleanup.

**Security:** path convention `captures/{business_id}/...` with TEXT comparison;
never getPublicUrl; MIME allowlist enforced server-side.

**Accessibility:** mic permission errors explained; keyboard-operable tray; progress
announced.

**Performance:** XHR upload with progress + cancel; client-side compression skips
small/gif; parallel loads.

**Tests:** quickCaptureMultimodal (24) — caps, mime allowlists, compress decisions,
capture_mode precedence, OCR sentence builder never fabricates, path boundary.

**Definition of Done:** a user can capture by any modality, confirm what the system
inferred, and see the real records created — with provenance intact.
