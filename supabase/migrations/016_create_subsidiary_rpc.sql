-- Securely create a new subsidiary inside the caller's organization.
-- The caller must be an owner/admin of an existing business.
CREATE OR REPLACE FUNCTION create_subsidiary(
  p_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_business_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_staff RECORD;
  v_parent RECORD;
  v_business_id UUID;
BEGIN
  SELECT id, business_id, user_id, name, email, role
  INTO v_staff
  FROM staff
  WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an organization owner or admin can create subsidiaries';
  END IF;

  SELECT * INTO v_parent FROM businesses WHERE id = v_staff.business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent business not found';
  END IF;

  INSERT INTO businesses (name, industry, organization_id, entity_type)
  VALUES (p_name, p_industry, v_parent.organization_id, 'subsidiary')
  RETURNING id INTO v_business_id;

  INSERT INTO staff (business_id, user_id, name, email, role)
  VALUES (v_business_id, v_staff.user_id, v_staff.name, v_staff.email, v_staff.role);

  INSERT INTO subsidiary_profiles (business_id, display_name, description, industry, business_model)
  VALUES (v_business_id, p_name, p_description, p_industry, p_business_model);

  INSERT INTO crm_configurations (business_id)
  VALUES (v_business_id);

  INSERT INTO crm_pipeline_stages (business_id, name, key, position, probability, stage_type)
  VALUES
    (v_business_id, 'Prospect', 'prospect', 0, 10, 'open'),
    (v_business_id, 'Qualified', 'qualified', 1, 30, 'open'),
    (v_business_id, 'Proposal', 'proposal', 2, 55, 'open'),
    (v_business_id, 'Negotiation', 'negotiation', 3, 75, 'open'),
    (v_business_id, 'Won', 'won', 4, 100, 'won'),
    (v_business_id, 'Lost', 'lost', 5, 0, 'lost');

  RETURN v_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION create_subsidiary(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_subsidiary(TEXT,TEXT,TEXT,TEXT) TO authenticated;
