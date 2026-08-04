-- ============================================
-- pgTAP Database Tests for Financial Functions
--
-- Tests for post_journal_entry and other
-- money-handling functions.
-- ============================================

BEGIN;
SELECT plan(30);

-- ============================================
-- TEST: post_journal_entry function
-- ============================================

-- Test: Reject unbalanced journal entry
SELECT throws_ok(
  $$SELECT post_journal_entry(
    'business_a',
    'Test unbalanced entry',
    ARRAY[
      ROW('debit', 'expenses', 1000, 'Test debit only')::journal_line
    ]
   )$$,
  'Check constraints violation|statement violation',
  'Unbalanced journal entry is rejected'
);

-- Test: Reject negative amount
SELECT throws_ok(
  $$SELECT post_journal_entry(
    'business_a',
    'Test negative',
    ARRAY[
      ROW('debit', 'expenses', -100, 'Negative debit')::journal_line,
      ROW('credit', 'cash', -100, 'Negative credit')::journal_line
    ]
  )$$,
  'Check constraints violation|statement violation',
  'Negative amounts are rejected'
);

-- Test: Reject zero amount
SELECT throws_ok(
  $$SELECT post_journal_entry(
    'business_a',
    'Test zero',
    ARRAY[
      ROW('debit', 'expenses', 0, 'Zero debit')::journal_line,
      ROW('credit', 'cash', 0, 'Zero credit')::journal_line
    ]
  )$$,
  'Check constraints violation|statement violation',
  'Zero amounts are rejected'
);

-- Test: Accept balanced journal entry
SELECT lives_ok(
  $$SELECT post_journal_entry(
    'business_a',
    'Test balanced entry',
    ARRAY[
      ROW('debit', 'expenses', 1000, 'Office supplies')::journal_line,
      ROW('credit', 'cash', 1000, 'Paid from cash')::journal_line
    ]
   )$$,
  'Balanced journal entry is accepted'
);

-- ============================================
-- TEST: Invoice total calculation
-- ============================================

-- Test: Create invoice with line items
SELECT lives_ok(
  $$INSERT INTO invoices (business_id, number, amount, status, created_by)
   VALUES ('business_a', 'INV-TEST-001', 0, 'draft', 'user_a')$$,
  'Can create draft invoice'
);

-- Test: Calculate invoice total (assuming trigger exists)
SELECT lives_ok(
  $$INSERT INTO invoice_items (invoice_id, description, quantity, unit_price)
   VALUES (
     (SELECT id FROM invoices WHERE number = 'INV-TEST-001' LIMIT 1),
     'Test Item',
     2,
     500
   )$$,
  'Can add invoice line item'
);

-- Test: Total is calculated correctly (2 * 500 = 1000)
SELECT results_eq(
  $$SELECT amount FROM invoices WHERE number = 'INV-TEST-001'$$,
  ARRAY[1000::numeric],
  'Invoice total is calculated correctly'
);

-- ============================================
-- TEST: Payment allocation
-- ============================================

-- Test: Create partial payment
SELECT lives_ok(
  $$INSERT INTO payments (business_id, invoice_id, amount, method, status, created_by)
   VALUES (
     'business_a',
     (SELECT id FROM invoices WHERE number = 'INV-TEST-001' LIMIT 1),
     500,
     'transfer',
     'completed',
     'user_a'
   )$$,
  'Can create partial payment'
);

-- Test: Invoice balance reflects partial payment
SELECT results_eq(
  $$SELECT amount - COALESCE((SELECT sum(amount) FROM payments WHERE invoice_id = 
     (SELECT id FROM invoices WHERE number = 'INV-TEST-001' LIMIT 1) AND status = 'completed'
  ), 0)
   FROM invoices WHERE number = 'INV-TEST-001'$$,
  ARRAY[500::numeric],
  'Invoice balance is correct after partial payment'
);

-- ============================================
-- TEST: Deal value calculations
-- ============================================

-- Test: Create deal
SELECT lives_ok(
  $$INSERT INTO deals (business_id, title, value, probability, stage, created_by)
   VALUES ('business_a', 'Test Deal', 100000, 50, 'active', 'user_a')$$,
  'Can create deal'
);

-- Test: Weighted value calculation
SELECT results_eq(
  $$SELECT round(value * probability / 100.0) 
   FROM deals WHERE title = 'Test Deal'$$,
  ARRAY[50000::numeric],
  'Weighted deal value is calculated correctly'
);

-- ============================================
-- TEST: Pipeline value aggregation
-- ============================================

-- Test: Add more deals
SELECT lives_ok(
  $$INSERT INTO deals (business_id, title, value, stage, created_by)
   VALUES 
     ('business_a', 'Deal 2', 200000, 'active', 'user_a'),
     ('business_a', 'Deal 3', 150000, 'proposal', 'user_a')$$,
  'Can add multiple deals'
);

-- Test: Pipeline value sum (excluding won/lost)
SELECT results_eq(
  $$SELECT sum(value) FROM deals 
   WHERE business_id = 'business_a' 
   AND stage NOT IN ('won', 'lost')$$,
  ARRAY[450000::numeric],
  'Pipeline value includes active, proposal, negotiation'
);

-- Test: Won deals value
SELECT lives_ok(
  $$UPDATE deals SET stage = 'won' WHERE title = 'Test Deal'$$,
  'Can mark deal as won'
);

SELECT results_eq(
  $$SELECT sum(value) FROM deals 
   WHERE business_id = 'business_a' AND stage = 'won'$$,
  ARRAY[100000::numeric],
  'Won deals value is tracked separately'
);

-- ============================================
-- TEST: Cash flow calculations
-- ============================================

-- Test: Add income entry
SELECT lives_ok(
  $$INSERT INTO cashflow (business_id, type, amount, category, description, created_by)
   VALUES ('business_a', 'income', 50000, 'sales', 'Test income', 'user_a')$$,
  'Can add income entry'
);

-- Test: Add expense entry
SELECT lives_ok(
  $$INSERT INTO cashflow (business_id, type, amount, category, description, created_by)
   VALUES ('business_a', 'expense', 20000, 'operations', 'Test expense', 'user_a')$$,
  'Can add expense entry'
);

-- Test: Net cash flow calculation
SELECT results_eq(
  $$SELECT 
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)
   FROM cashflow WHERE business_id = 'business_a'$$,
  ARRAY[30000::numeric],
  'Net cash flow is calculated correctly'
);

-- ============================================
-- CLEANUP
-- ============================================

DELETE FROM deals WHERE business_id = 'business_a';
DELETE FROM invoices WHERE business_id = 'business_a';
DELETE FROM payments WHERE business_id = 'business_a';
DELETE FROM cashflow WHERE business_id = 'business_a';

SELECT * FROM finish();
ROLLBACK;
