-- Performance: composite indexes for the hot query shapes the app actually
-- runs (RLS pattern: business_id filter + status/date sort). Single-column
-- indexes already exist on many of these tables; the composites below serve
-- the real multi-filter queries without index-scan fan-out.
-- Idempotent: CREATE INDEX IF NOT EXISTS. Applies after all table-creating
-- migrations (zzzzz_ sorts last).

-- Invoices: receivables card, overdue aging, digests, EBITDA.
CREATE INDEX IF NOT EXISTS idx_invoices_business_status ON invoices (business_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_business_due ON invoices (business_id, due_date);

-- Deals: pipeline card, "my deals" filter, CRM board.
CREATE INDEX IF NOT EXISTS idx_deals_business_stage ON deals (business_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_business_owner ON deals (business_id, owner_id);

-- Tasks: My Work attention query (business + open status + due date).
CREATE INDEX IF NOT EXISTS idx_tasks_business_status_due ON tasks (business_id, status, due_date);

-- Transactions: EBITDA / cash-flow / metrics engine (business + type + time).
CREATE INDEX IF NOT EXISTS idx_transactions_business_type ON transactions (business_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_business_created ON transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items (transaction_id);

-- Leads + campaigns: function-home marketing/sales cards.
CREATE INDEX IF NOT EXISTS idx_leads_business_status ON leads (business_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_business_status ON email_campaigns (business_id, status);

-- Notifications: bell query (user + newest first).
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);

-- Staff: people directory + active-member filters.
CREATE INDEX IF NOT EXISTS idx_staff_business_active ON staff (business_id, active);
