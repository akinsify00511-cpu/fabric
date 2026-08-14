-- 099_intelligence_notifications.sql
-- §25 Notification integration. Intelligence must surface material findings to
-- the people who can act — but NOT spam. This trigger creates ONE notification
-- per CRITICAL recommendation at the moment it is issued, targeted at the
-- business owner. Non-critical recommendations surface in the Cockpit/MPR only
-- (no notification) per the §25 anti-spam rule.
--
-- Why a trigger (not a frontend call):
--   - Recommendations are issued by the scheduled pg_cron job (092), so no user
--     is "in the app" when one fires. A trigger guarantees the notification is
--     created server-side regardless of who/what issued the claim.
--   - It is best-effort (EXCEPTION): a notification failure never breaks the
--     recommendation itself (§24 intelligence failure isolation).
--
-- Anti-spam (§25):
--   - Only severity = 'critical' creates a notification (warnings/info surface
--     in the Cockpit/MPR).
--   - The claims dedup (partial unique index on open recommendations per
--     rule+entity, 091) means a rule does not re-issue while open — so the
--     same condition notifies once, not on every hourly refresh.
--   - Targeted at the business owner only (the accountable party), not every
--     staff member.

\set ON_ERROR_STOP on

-- Idempotency guard: don't notify twice for the same claim.
CREATE TABLE IF NOT EXISTS intelligence_notification_log (
  claim_id UUID PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION notify_critical_recommendation()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_staff UUID;
  v_business UUID;
  v_rule_id TEXT;
  v_title TEXT;
  v_msg TEXT;
  v_link TEXT;
BEGIN
  -- Only for newly-issued critical recommendations.
  IF NEW.claim_type <> 'RECOMMENDATION' THEN RETURN NEW; END IF;
  IF NEW.status <> 'issued' THEN RETURN NEW; END IF;
  IF NEW.severity <> 'critical' THEN RETURN NEW; END IF;
  IF OLD.status = 'issued' THEN RETURN NEW; END IF;  -- not a fresh issue

  -- Don't notify twice for the same claim.
  IF EXISTS (SELECT 1 FROM intelligence_notification_log WHERE claim_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_business := NEW.business_id;
  v_rule_id := COALESCE(NEW.rule_id, 'intelligence');

  -- Target the business owner (the accountable party). Fall back to no-one if
  -- there is no owner row — the recommendation still surfaces in the Cockpit.
  SELECT id INTO v_owner_staff
  FROM staff
  WHERE business_id = v_business AND role = 'owner'
  ORDER BY created_at LIMIT 1;

  IF v_owner_staff IS NULL THEN
    RETURN NEW;  -- no owner to notify; recommendation remains in the Cockpit
  END IF;

  -- Humanized, specific message (§13/§18). The claim's statement already is
  -- humanized by the issuer; we keep the notification concise + actionable.
  v_title := 'Action needed: ' || v_rule_id;
  v_msg  := LEFT(COALESCE(NEW.statement, 'A critical recommendation was issued.'), 280);

  -- Deep-link to the Cockpit where the recommendation can be accepted/acted on.
  v_link := '/app/cockpit';

  BEGIN
    INSERT INTO notifications (business_id, staff_id, type, priority, title,
      message, link, source_type, related_id, is_read, created_at)
    VALUES (v_business, v_owner_staff, 'intelligence', 'urgent',
      v_title, v_msg, v_link, 'recommendation', NEW.id, false, NOW());

    INSERT INTO intelligence_notification_log (claim_id) VALUES (NEW.id)
    ON CONFLICT (claim_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Notification is best-effort: never break the recommendation (§24).
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_critical_recommendation ON claims;
CREATE TRIGGER trg_notify_critical_recommendation
  AFTER INSERT OR UPDATE OF status ON claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_critical_recommendation();

-- The trigger writes notifications; grant matches the existing notifications
-- RLS pattern (service role / owner). The SECURITY DEFINER function runs as
-- the table owner so it can insert regardless of the caller's role.
COMMENT ON FUNCTION notify_critical_recommendation IS
'§25 — creates ONE notification for a newly-issued CRITICAL recommendation, targeted at the business owner. Best-effort (§24). Anti-spam: only critical severity, claims dedup prevents repeats, owner-only targeting.';
