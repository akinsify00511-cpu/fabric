-- ============================================================================
-- Migration 050: Public e-Signature signing flow
-- ----------------------------------------------------------------------------
-- The schema in 043 supports external signers via signing_token + RLS, but
-- an unauthenticated signer cannot set the `signer_token` local config that
-- the RLS policy reads. This migration adds SECURITY DEFINER RPC functions
-- so the public /sign/:token page can load a request and record a signature
-- without requiring a login, while still being auditable and tamper-evident.
-- ============================================================================

\set ON_ERROR_STOP on

-- Returns the signer row + parent request + all signers' progress for a token.
-- Safe to expose: token is a 32-byte secret, and only the holder can view.
CREATE OR REPLACE FUNCTION public.get_signature_request_by_token(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_signer RECORD;
  v_request RECORD;
  v_signers JSONB;
BEGIN
  SELECT * INTO v_signer
  FROM public.signature_signers
  WHERE signing_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT * INTO v_request
  FROM public.signature_requests
  WHERE id = v_signer.request_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'email', s.email,
      'order_index', s.order_index,
      'status', s.status,
      'signed_at', s.signed_at
    ) ORDER BY s.order_index
  ), '[]'::jsonb) INTO v_signers
  FROM public.signature_signers s
  WHERE s.request_id = v_signer.request_id;

  RETURN jsonb_build_object(
    'signer', jsonb_build_object(
      'id', v_signer.id,
      'name', v_signer.name,
      'email', v_signer.email,
      'order_index', v_signer.order_index,
      'status', v_signer.status,
      'viewed_at', v_signer.viewed_at,
      'signed_at', v_signer.signed_at,
      'signature_image_url', v_signer.signature_image_url
    ),
    'request', jsonb_build_object(
      'id', v_request.id,
      'title', v_request.title,
      'description', v_request.description,
      'document_name', v_request.document_name,
      'document_url', v_request.document_url,
      'status', v_request.status,
      'message', v_request.message,
      'expires_at', v_request.expires_at,
      'created_at', v_request.created_at
    ),
    'all_signers', v_signers
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marks the signing-token holder as having viewed the document.
CREATE OR REPLACE FUNCTION public.mark_signature_viewed(p_token TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.signature_signers
  SET viewed_at = NOW(),
      status = CASE WHEN status = 'pending' THEN 'viewed' ELSE status END
  WHERE signing_token = p_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Records a signature for the token holder. Captures IP + user-agent for the
-- audit trail, stores the signature image, and flips the signer to 'signed'.
-- If this was the last pending signer, the parent request is completed.
CREATE OR REPLACE FUNCTION public.record_signature(
  p_token TEXT,
  p_signature_image_url TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_signer RECORD;
  v_request_id UUID;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_signer
  FROM public.signature_signers
  WHERE signing_token = p_token
    AND status IN ('pending', 'viewed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_or_already_signed');
  END IF;

  v_request_id := v_signer.request_id;

  UPDATE public.signature_signers
  SET
    status = 'signed',
    signed_at = NOW(),
    signature_image_url = p_signature_image_url,
    ip_address = p_ip_address,
    user_agent = p_user_agent
  WHERE id = v_signer.id;

  -- Count remaining unsigned signers for this request
  SELECT COUNT(*) INTO v_remaining
  FROM public.signature_signers
  WHERE request_id = v_request_id
    AND status NOT IN ('signed', 'declined');

  IF v_remaining = 0 THEN
    UPDATE public.signature_requests
    SET status = 'signed'
    WHERE id = v_request_id;
  ELSE
    UPDATE public.signature_requests
    SET status = 'partially_signed'
    WHERE id = v_request_id AND status NOT IN ('signed', 'voided');
  END IF;

  RETURN jsonb_build_object('ok', true, 'completed', v_remaining = 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decline to sign for the token holder.
CREATE OR REPLACE FUNCTION public.decline_signature(p_token TEXT)
RETURNS VOID AS $$
DECLARE
  v_request_id UUID;
BEGIN
  UPDATE public.signature_signers
  SET status = 'declined'
  WHERE signing_token = p_token
    AND status IN ('pending', 'viewed')
  RETURNING request_id INTO v_request_id;

  IF v_request_id IS NOT NULL THEN
    UPDATE public.signature_requests
    SET status = 'declined'
    WHERE id = v_request_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant the anon role execute on these functions so unauthenticated signers
-- can use the public signing page.
GRANT EXECUTE ON FUNCTION public.get_signature_request_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_signature_viewed(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_signature(TEXT, TEXT, INET, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_signature(TEXT) TO anon, authenticated;
