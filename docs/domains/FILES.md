# DOMAIN: FILES

**Purpose:** the formal file lifecycle — Upload → Validation → Storage → Permissions
→ Processing → Preview → Usage → Retention → Deletion — tenant-isolated, with storage
paths NEVER serving as an authorization mechanism.

**Entities:** storage buckets (all PRIVATE: avatars, documents, signatures,
meeting-recordings, capture-attachments, receipts, brand-assets) + per-domain
metadata tables (meeting_media, capture_attachments, receipt_documents,
company_documents/staff_documents).

**States:** pending → available/failed (upload two-phase: create path → upload →
finalize); retention → expired (expire_recordings sweeper); deletion returns the
path for storage cleanup (no orphans).

**User flows:** create-upload-path RPC (validates + returns private path) → client
uploads (XHR with progress) → finalize → access via signed-URL RPC (membership
verified) → processing (OCR/transcription where applicable).

**Permissions:** every bucket access gated by a membership-verifying RPC; storage
RLS keys off the `{business_id}/...` path convention with TEXT comparison (no uuid
cast that could error the query on malformed paths).

**Database:** bucket creation migrations (030/046/1001/20260819050000/...);
storage RLS policies per bucket.

**APIs:** create_recording_upload_path / finalize_recording /
generate_recording_signed_url; create_capture_attachment / finalize /
generate_capture_attachment_url; create_receipt_upload_path; brand-assets bucket.

**Events:** uploads/captures emit business_events via their parent flows.

**Notifications:** via parent domain (meeting report ready, receipt confirmed).

**Analytics:** storage usage is a candidate entitlement limit (see ENTITLEMENTS.md
— storage limits are defined there as a class; per-business metering rides on
metadata tables' size_bytes).

**AI interaction:** processing step (OCR/Whisper) under the anti-fabrication
contract; results are AI INFERRED until USER CONFIRMED.

**Failure states:** upload fails → failed status + retry (blob kept); finalize
without upload → stays pending; signed URL for pending object → NULL (gate).

**Recovery:** delete returns the storage path; retention sweepers mark expired.

**Security:** threat model §7 (malicious uploads). Validation server-side (mime
allowlist + size caps). NEVER getPublicUrl on a private bucket (constitutional
violation — the Session 24/26 boundary).

**Accessibility:** upload progress announced; previews have alt text.

**Performance:** client-side compression before upload (images >300KB, skip gifs);
signed URLs short-lived.

**Tests:** quickCaptureMultimodal (path boundary, caps); receipt suite (signed-URL
boundary, cross-business denial).

**Definition of Done:** no file is publicly addressable; every file traces to a
tenant; retention and deletion are real, not aspirational.
