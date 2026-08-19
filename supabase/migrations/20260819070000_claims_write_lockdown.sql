-- Session-33 closure (Stage-33c): claims write lockdown.
-- claims is the intelligence ledger: every recommendation/action declaration.
-- The claims_managing policy let ANY business member INSERT/UPDATE/DELETE
-- arbitrary claim rows — including claim_type='INFERENCE', status='accepted',
-- confidence=1.0 — Brain-poisoning verified adversarially (P0). Claims are
-- written only by the recommendation/lifecycle RPCs (SECURITY DEFINER,
-- membership-guarded since the zz closure). Members get SELECT only.
DROP POLICY IF EXISTS claims_managing ON public.claims;

-- Re-create a read-only policy if the original also covered read (the
-- explicit claims_viewable SELECT policy already exists; keep as-is).

COMMENT ON TABLE public.claims IS
  'Intelligence ledger. Written only via SECURITY DEFINER RPCs (issue_recommendation, lifecycle calls). Direct client mutation closed (Session-33 Stage-c).';

SELECT 1;
