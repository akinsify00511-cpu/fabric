-- ============================================================================
-- AUDIT LOGS COLUMN RECONCILIATION
-- ============================================================================
-- audit_logs was first created by 012_custom_branding.sql WITHOUT the
-- change-tracking columns (entity_type, entity_id, old_values, new_values,
-- changed_fields, session_id) and WITH a NOT NULL resource_type column.
-- 038_critical_infrastructure.sql re-created it with the richer shape but via
-- CREATE TABLE IF NOT EXISTS (a no-op once 012 had run) and only ALTERed four
-- columns back. The result: the physical table on any DB that applied 012
-- first lacks the columns the trigger-based logger (056) writes, so every
-- audited INSERT/UPDATE/DELETE fails with "column changed_fields does not
-- exist" (and would then fail on 012's NOT NULL resource_type, which the
-- 056 insert shape never populates).
--
-- This migration reconciles the physical table to the 056 logger contract.
-- Idempotent: ADD COLUMN IF NOT EXISTS + unconditional DROP NOT NULL.
-- ============================================================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS changed_fields TEXT[],
  ADD COLUMN IF NOT EXISTS session_id TEXT;

-- 012-era constraints the 056 trigger logger never satisfies: the logger
-- writes entity_type (not resource_type) and derives business_id from the
-- row (NULL for rows without one). Keep audited writes from failing.
ALTER TABLE public.audit_logs ALTER COLUMN resource_type DROP NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN business_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- UPDATED_AT TRIGGER DRIFT REPAIR (found by the RLS attack suite)
-- ---------------------------------------------------------------------------
-- These tables carry update_updated_at()/update_updated_at_column() triggers
-- but lack the updated_at column (an earlier migration's CREATE TABLE won the
-- IF NOT EXISTS race and a later definition-with-trigger was skipped). Every
-- UPDATE on them fails with 'record NEW has no field updated_at' — the event
-- bus's process_business_event hits this on its very first
-- `UPDATE business_events SET processed = FALSE`. Add the column (idempotent)
-- so the existing triggers work as intended.

ALTER TABLE public.business_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.notification_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
