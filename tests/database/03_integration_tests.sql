-- ============================================
-- pgTAP Tests for Integration Features
--
-- Tests for webhook dispatch and automation execution
-- (These will fail until Edge Functions are deployed)
-- ============================================

BEGIN;
SELECT plan(15);

-- ============================================
-- TEST: Automation trigger insertion
-- ============================================

-- Test: Create automation rule
SELECT lives_ok(
  $$INSERT INTO automations (business_id, name, trigger_type, action_type, enabled, created_by)
   VALUES (
     'business_a',
     'Notify on Deal Won',
     'deal_won',
     'send_notification',
     true,
     'user_a'
   )$$,
  'Can create automation rule'
);

-- ============================================
-- TEST: Automation execution logging
-- ============================================

-- Test: Manual execution creates log
SELECT lives_ok(
  $$INSERT INTO automation_runs (
    automation_id,
    trigger_event,
    status,
    duration_ms
  ) VALUES (
    (SELECT id FROM automations WHERE name = 'Notify on Deal Won' LIMIT 1),
    '{"trigger": "deal_won", "payload": {"deal_id": "test"}}',
    'success',
    150
  )$$,
  'Automation execution creates run log'
);

-- Test: Run count is incremented
SELECT results_eq(
  $$SELECT run_count FROM automations WHERE name = 'Notify on Deal Won'$$,
  ARRAY[1::integer],
  'Automation run count is incremented'
);

-- Test: Last run timestamp is set
SELECT results_ne(
  $$SELECT last_run_at FROM automations WHERE name = 'Notify on Deal Won'$$,
  ARRAY[NULL::timestamptz],
  'Last run timestamp is set'
);

-- ============================================
-- TEST: Webhook registration
-- ============================================

-- Test: Create webhook
SELECT lives_ok(
  $$INSERT INTO webhooks (business_id, name, url, events, is_active, created_by)
   VALUES (
     'business_a',
     'Test Webhook',
     'https://example.com/webhook',
     ARRAY['deal.won', 'invoice.paid'],
     true,
     'user_a'
   )$$,
  'Can create webhook'
);

-- ============================================
-- TEST: Webhook dispatch logging
-- ============================================

-- Test: Dispatch creates log
SELECT lives_ok(
  $$INSERT INTO webhook_logs (
    webhook_id,
    event,
    status,
    response_status,
    duration_ms
  ) VALUES (
    (SELECT id FROM webhooks WHERE name = 'Test Webhook' LIMIT 1),
    'deal.won',
    'success',
    200,
    50
  )$$,
  'Webhook dispatch creates log'
);

-- Test: Last triggered timestamp is updated
SELECT results_ne(
  $$SELECT last_triggered_at FROM webhooks WHERE name = 'Test Webhook'$$,
  ARRAY[NULL::timestamptz],
  'Last triggered timestamp is updated'
);

-- Test: Success timestamp is updated on success
SELECT results_ne(
  $$SELECT last_success_at FROM webhooks WHERE name = 'Test Webhook'$$,
  ARRAY[NULL::timestamptz],
  'Last success timestamp is updated'
);

-- ============================================
-- TEST: Webhook failure logging
-- ============================================

-- Test: Failed dispatch creates log
SELECT lives_ok(
  $$INSERT INTO webhook_logs (
    webhook_id,
    event,
    status,
    response_status,
    response_body,
    duration_ms
  ) VALUES (
    (SELECT id FROM webhooks WHERE name = 'Test Webhook' LIMIT 1),
    'deal.won',
    'failed',
    500,
    'Internal Server Error',
    1000
  )$$,
  'Failed webhook dispatch creates log'
);

-- Test: Error is recorded on webhook
SELECT results_eq(
  $$SELECT last_error FROM webhooks WHERE name = 'Test Webhook'$$,
  ARRAY['Internal Server Error'::text],
  'Webhook last error is recorded'
);

-- ============================================
-- TEST: Notification creation (automation action)
-- ============================================

-- Test: Create notification
SELECT lives_ok(
  $$INSERT INTO notifications (user_id, business_id, title, message, type, related_type)
   VALUES (
     'user_a',
     'business_a',
     'Deal Won!',
     'Congratulations! You won a deal.',
     'automation',
     'deal'
   )$$,
  'Can create notification'
);

-- Test: User sees their notification
SELECT results_eq(
  $$SELECT count(*) FROM notifications 
   WHERE user_id = 'user_a' AND type = 'automation'$$,
  ARRAY[1::bigint],
  'User sees automation notification'
);

-- ============================================
-- TEST: Cascade delete behavior
-- ============================================

-- Test: Deleting business cascades to deals
SELECT lives_ok(
  $$DELETE FROM businesses WHERE id = 'business_a'$$,
  'Deleting business should cascade'
);

SELECT results_eq(
  $$SELECT count(*) FROM deals WHERE business_id = 'business_a'$$,
  ARRAY[0::bigint],
  'Deals are deleted when business is deleted'
);

SELECT results_eq(
  $$SELECT count(*) FROM notifications WHERE business_id = 'business_a'$$,
  ARRAY[0::bigint],
  'Notifications are deleted when business is deleted'
);

-- ============================================
-- CLEANUP (if business wasn't deleted)
-- ============================================

-- Note: These would only run if the DELETE above didn't cascade properly
-- DELETE FROM automation_runs WHERE automation_id IN (SELECT id FROM automations WHERE business_id = 'business_a');
-- DELETE FROM automations WHERE business_id = 'business_a';
-- DELETE FROM webhook_logs WHERE webhook_id IN (SELECT id FROM webhooks WHERE business_id = 'business_a');
-- DELETE FROM webhooks WHERE business_id = 'business_a';
-- DELETE FROM notifications WHERE business_id = 'business_a';

SELECT * FROM finish();
ROLLBACK;
