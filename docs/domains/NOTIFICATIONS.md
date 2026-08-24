# DOMAIN: NOTIFICATIONS

**Purpose:** ONE centralized notification service — every domain uses it; no domain
creates an independent implementation.

**Entities:** notifications (canonical), notification_templates,
notification_preferences, intelligence_notification_log (dedup), email_events
(transactional email ledger — the email rail of notifications).

**States:** notification created → read (unread count derives); email queued → sent →
delivered/bounced (forward-only).

**Responsibilities:** bell + unread count + read/unread + deep links + priority +
categories + preferences; transactional email via queue_email; digests.

**User flows:** bell (priority-ordered: invoice_overdue > task_due > payment > … >
achievement; unread beats read within a band) → deep-link to source; email
preferences per category; daily/weekly business digest (opt-in; plain-language lines
citing real sources; idempotent 20h/6d dedup).

**Permissions:** notifications are user-scoped (RLS); queue_email membership-guarded;
digest opt-in per 7.4.

**Database:** notifications 036/040 (category enum + type), 099 (intelligence
notifications + dedup log), 20260822170000 (email subsystem, 19 templates).

**APIs:** queue_email RPC; send_business_digest RPC; email-service edge fn (drains
the queue; business verified domain overrides platform From); resend-webhook.

**Events:** notification triggers fire from domain events (critical recommendation,
payment lifecycle, demand chain, meeting reports); NOTIFICATION_SENT/FAILED tracked
in email_events.

**Notifications:** (this IS the domain).

**Analytics:** email_events ledger (delivery/bounce/open); digest_log.

**AI interaction:** critical recommendations notify the owner once (deduped);
digest lines are deterministic compositions, never LLM-invented urgency.

**Failure states:** email send failure → stays queued, retried by drain; notification
insert failure is EXCEPTION-wrapped where it rides on business writes (a notification
failure never breaks the business write).

**Recovery:** email-service `process` action drains the queue; bounced addresses
surface in the ledger.

**Security:** templates server-side; business verified sending domains (Resend DNS)
— domain verification groundwork in business_email_domains.

**Accessibility:** bell announces unread count; notifications navigable by keyboard.

**Performance:** priority sort client-side; bell query scoped + indexed
(user_id, created_at DESC).

**Tests:** notification priority ordering tests; email subsystem suite
(transition guard, receipt+failed queueing, member-vs-outsider RLS).

**Definition of Done:** every domain notifies through this service; delivery and
failure states are visible in the ledger; no notification spam (priority + dedup +
opt-in digest).
