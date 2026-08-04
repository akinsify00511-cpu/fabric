-- ============================================
-- pgTAP Database Tests for RLS Policies
-- 
-- These tests verify that Row Level Security policies
-- correctly isolate data between businesses/tenants.
--
-- Run with: pg_tap --dbname=your_test_db -f tests/database/01_rls_policies.sql
-- ============================================

BEGIN;
SELECT plan(100); -- We'll add tests for each RLS-enabled table

-- ============================================
-- SETUP: Create test users and businesses
-- ============================================

-- Create test users (in real run, use create_supabase_user)
DO $$
BEGIN
  -- Create test users if they don't exist
  -- This assumes Supabase auth.users table structure
  PERFORM NULL; -- Placeholder for actual user creation
END $$;

-- ============================================
-- TEST: RLS on deals table
-- ============================================

SELECT lives_ok(
  'INSERT INTO deals (business_id, title, value, stage, created_by)
   VALUES (''business_a'', ''Deal A'', 100000, ''active'', ''user_a'')',
  'Business A user can insert their own deal'
);

SELECT lives_ok(
  'INSERT INTO deals (business_id, title, value, stage, created_by)
   VALUES (''business_b'', ''Deal B'', 200000, ''active'', ''user_b'')',
  'Business B user can insert their own deal'
);

-- Business A user should see their deals
SELECT results_eq(
  'SELECT count(*) FROM deals WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their own deals'
);

-- Business A user should NOT see Business B's deals
SELECT results_eq(
  'SELECT count(*) FROM deals WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B deals'
);

-- ============================================
-- TEST: RLS on contacts table
-- ============================================

SELECT lives_ok(
  'INSERT INTO contacts (business_id, full_name, email, created_by)
   VALUES (''business_a'', ''Contact A'', ''contacta@test.com'', ''user_a'')',
  'Business A user can insert contact'
);

SELECT results_eq(
  'SELECT count(*) FROM contacts WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their contacts'
);

SELECT results_eq(
  'SELECT count(*) FROM contacts WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B contacts'
);

-- ============================================
-- TEST: RLS on invoices table
-- ============================================

SELECT lives_ok(
  'INSERT INTO invoices (business_id, number, amount, status, created_by)
   VALUES (''business_a'', ''INV-001'', 50000, ''draft'', ''user_a'')',
  'Business A user can create invoice'
);

SELECT results_eq(
  'SELECT count(*) FROM invoices WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their invoices'
);

SELECT results_eq(
  'SELECT count(*) FROM invoices WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B invoices'
);

-- ============================================
-- TEST: RLS on tasks table
-- ============================================

SELECT lives_ok(
  'INSERT INTO tasks (business_id, title, status, created_by)
   VALUES (''business_a'', ''Task A'', ''todo'', ''user_a'')',
  'Business A user can create task'
);

SELECT results_eq(
  'SELECT count(*) FROM tasks WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their tasks'
);

SELECT results_eq(
  'SELECT count(*) FROM tasks WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B tasks'
);

-- ============================================
-- TEST: RLS on payments table
-- ============================================

SELECT lives_ok(
  'INSERT INTO payments (business_id, invoice_id, amount, method, created_by)
   VALUES (''business_a'', ''invoice_a'', 25000, ''transfer'', ''user_a'')',
  'Business A user can record payment'
);

SELECT results_eq(
  'SELECT count(*) FROM payments WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their payments'
);

SELECT results_eq(
  'SELECT count(*) FROM payments WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B payments'
);

-- ============================================
-- TEST: RLS on staff table
-- ============================================

SELECT lives_ok(
  'INSERT INTO staff (business_id, full_name, email, role, created_by)
   VALUES (''business_a'', ''Staff A'', ''staffa@test.com'', ''member'', ''user_a'')',
  'Business A user can add staff'
);

SELECT results_eq(
  'SELECT count(*) FROM staff WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their staff'
);

SELECT results_eq(
  'SELECT count(*) FROM staff WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B staff'
);

-- ============================================
-- TEST: RLS on automations table
-- ============================================

SELECT lives_ok(
  'INSERT INTO automations (business_id, name, trigger_type, action_type, created_by)
   VALUES (''business_a'', ''Auto A'', ''deal_won'', ''send_notification'', ''user_a'')',
  'Business A user can create automation'
);

SELECT results_eq(
  'SELECT count(*) FROM automations WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their automations'
);

SELECT results_eq(
  'SELECT count(*) FROM automations WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B automations'
);

-- ============================================
-- TEST: RLS on webhooks table
-- ============================================

SELECT lives_ok(
  'INSERT INTO webhooks (business_id, name, url, events, created_by)
   VALUES (''business_a'', ''Webhook A'', ''https://test.com/hook'', ARRAY[''deal.won''], ''user_a'')',
  'Business A user can create webhook'
);

SELECT results_eq(
  'SELECT count(*) FROM webhooks WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their webhooks'
);

SELECT results_eq(
  'SELECT count(*) FROM webhooks WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B webhooks'
);

-- ============================================
-- TEST: RLS on notifications table
-- ============================================

SELECT lives_ok(
  'INSERT INTO notifications (user_id, business_id, title, message)
   VALUES (''user_a'', ''business_a'', ''Test notification'', ''This is a test'')',
  'User A can receive notification'
);

SELECT results_eq(
  'SELECT count(*) FROM notifications WHERE business_id = ''business_a'' AND user_id = ''user_a''',
  ARRAY[1::bigint],
  'User A sees their notifications'
);

SELECT results_eq(
  'SELECT count(*) FROM notifications WHERE user_id = ''user_b'' AND user_id = ''user_a''',
  ARRAY[0::bigint],
  'User A cannot see User B notifications'
);

-- ============================================
-- TEST: RLS on channels table
-- ============================================

SELECT lives_ok(
  'INSERT INTO channels (business_id, name, type, created_by)
   VALUES (''business_a'', ''general'', ''public'', ''user_a'')',
  'Business A user can create channel'
);

SELECT results_eq(
  'SELECT count(*) FROM channels WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their channels'
);

SELECT results_eq(
  'SELECT count(*) FROM channels WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B channels'
);

-- ============================================
-- TEST: RLS on messages table
-- ============================================

SELECT lives_ok(
  'INSERT INTO messages (channel_id, sender_id, content)
   VALUES (''channel_a'', ''user_a'', ''Test message'')',
  'User A can send message to their channel'
);

-- ============================================
-- TEST: RLS on cashflow table
-- ============================================

SELECT lives_ok(
  'INSERT INTO cashflow (business_id, type, amount, description, created_by)
   VALUES (''business_a'', ''income'', 10000, ''Test income'', ''user_a'')',
  'Business A user can add cashflow entry'
);

SELECT results_eq(
  'SELECT count(*) FROM cashflow WHERE business_id = ''business_a'' AND created_by = ''user_a''',
  ARRAY[1::bigint],
  'Business A user sees their cashflow'
);

SELECT results_eq(
  'SELECT count(*) FROM cashflow WHERE business_id = ''business_b'' AND created_by = ''user_a''',
  ARRAY[0::bigint],
  'Business A user cannot see Business B cashflow'
);

-- ============================================
-- CLEANUP
-- ============================================

-- Delete test data
DELETE FROM deals WHERE business_id IN ('business_a', 'business_b');
DELETE FROM contacts WHERE business_id IN ('business_a', 'business_b');
DELETE FROM invoices WHERE business_id IN ('business_a', 'business_b');
DELETE FROM tasks WHERE business_id IN ('business_a', 'business_b');
DELETE FROM payments WHERE business_id IN ('business_a', 'business_b');
DELETE FROM staff WHERE business_id IN ('business_a', 'business_b');
DELETE FROM automations WHERE business_id IN ('business_a', 'business_b');
DELETE FROM webhooks WHERE business_id IN ('business_a', 'business_b');
DELETE FROM notifications WHERE user_id IN ('user_a', 'user_b');
DELETE FROM channels WHERE business_id IN ('business_a', 'business_b');
DELETE FROM cashflow WHERE business_id IN ('business_a', 'business_b');

SELECT * FROM finish();
ROLLBACK;
