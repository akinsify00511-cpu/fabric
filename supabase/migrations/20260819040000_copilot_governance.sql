-- Generative Copilot governance (Avenize-first: deterministic core + provider
-- abstraction, never required).
--
-- Design (per the Avenize-first directive):
--   1. Deterministic core FIRST: the ask-avenize edge function always
--      assembles real business context (health, metrics, recommendations,
--      state) via the existing membership-guarded RPCs, and answers
--      deterministically whenever the intent maps to governed data.
--   2. An LLM provider (OPENAI_API_KEY / ANTHROPIC_API_KEY) is an OPTIONAL
--      fallback for open-ended questions — never required, never allowed to
--      answer blind. When no provider is configured, the copilot answers
--      from the deterministic layer alone.
--   3. Governance + cost controls: every message logged here, daily cap per
--      business enforced by the edge function, provider recorded per answer
--      (FACT: 'deterministic' | 'openai' | 'anthropic').
--
-- Anti-fabrication (§22): the system prompt the edge function sends to any
-- provider forbids inventing numbers; the deterministic layer only ever
-- quotes real values from the assembled context.

-- =============================================================================
-- 1. copilot_messages — the conversation log (both sides), business-scoped.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.copilot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,                        -- the staff user who asked
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  provider TEXT,                                -- 'deterministic' | 'openai' | 'anthropic'
  sources TEXT[] NOT NULL DEFAULT '{}',         -- which governed data the answer used
  intent TEXT,                                  -- router intent (deterministic answers)
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,  -- the context the answer was grounded in
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS copilot_messages_business_select ON public.copilot_messages;
CREATE POLICY copilot_messages_business_select ON public.copilot_messages
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM public.get_current_staff()));

-- No client INSERT policy: only the ask-avenize edge function (service role)
-- writes messages, after it has verified membership + enforced the daily cap.

CREATE INDEX IF NOT EXISTS idx_copilot_messages_business_day
  ON public.copilot_messages (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_user
  ON public.copilot_messages (user_id, created_at DESC);

COMMENT ON TABLE public.copilot_messages IS
  'Copilot conversation log. Both user + assistant messages, with the provider that answered and the governed sources used. Written only by the ask-avenize edge function (membership + daily cap enforced server-side).';

-- =============================================================================
-- 2. copilot_daily_usage — one read helper for the edge function's cap check.
--    Membership-guarded like every other SECURITY DEFINER that takes a
--    business_id (the #18 cross-tenant lesson).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.copilot_daily_usage(p_business_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.get_current_staff() cs WHERE cs.business_id = p_business_id
    )
    THEN (
      SELECT COUNT(*)::INTEGER
      FROM public.copilot_messages m
      WHERE m.business_id = p_business_id
        AND m.role = 'user'
        AND m.created_at >= date_trunc('day', now())
    )
    ELSE 0
  END
$$;

REVOKE EXECUTE ON FUNCTION public.copilot_daily_usage(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.copilot_daily_usage(UUID) TO authenticated;

COMMENT ON FUNCTION public.copilot_daily_usage(UUID) IS
  'Copilot governance: user messages today for the business. Membership-guarded (returns 0 for non-members). The edge function enforces the daily cap; this is the same count the UI can show.';
