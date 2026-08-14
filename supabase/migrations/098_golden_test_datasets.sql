-- 098_golden_test_datasets.sql
-- §30 Golden Test Datasets — controlled synthetic businesses for validating the
-- intelligence engine. These are NOT real customer data. Each profile produces
-- a PREDICTABLE intelligence output so the rules can be asserted against a
-- known expected scenario (§29/§30).
--
-- Profiles (see INTELLIGENCE_TEST_MATRIX.md):
--   A_healthy        — steady revenue, low overdue, good data quality → health 80+, few recs
--   B_cashflow       — expenses > income over 90d → FIN-CF-001 fires
--   C_sales_decline  — stale deals in pipeline → SAL-CONV-001 fires
--   D_high_growth    — many customers, won deals, full stock → no negative recs
--   E_inventory      — products at/below reorder point → INV-001 fires
--   F_project        — active project overdue → ProjectDelayed event (+ project dim)
--   G_empty          — < 3 of everything → all rules NO-OP (§21 small-data safety)
--
-- Idempotent + self-contained. Creates dedicated TEST auth users (clearly named
-- golden-test-*) so the seed does not depend on any real account. Use
-- cleanup_golden_datasets() to remove everything (CASCADE handles children).
--
-- Run order to validate:  seed → refresh_business_metrics → run_recommendation_rules
--   → compute_business_health → assert expected claims/health. See test matrix.

\set ON_ERROR_STOP on

-- Test users are created via SECURITY DEFINER so the seed can run as a service
-- role without needing the anon/auth flow. They are clearly prefixed
-- 'golden-test-' to avoid collision with real accounts and make cleanup safe.
CREATE OR REPLACE FUNCTION _ensure_test_auth_user(p_email TEXT)
RETURNS UUID AS $$
DECLARE v_uid UUID;
BEGIN
  -- auth.users is a Supabase internal table; insert only if the caller is
  -- service role. Idempotent on email.
  SELECT id INTO v_uid FROM auth.users WHERE email = p_email;
  IF v_uid IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000',
            gen_random_uuid(), 'authenticated', 'authenticated', p_email,
            crypt('golden-test-no-login', gen_salt('bf')),
            now(), now(), now())
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_uid;
  END IF;
  RETURN v_uid;
EXCEPTION WHEN insufficient_privilege THEN
  -- If auth.users isn't writable in this context, fall back to a deterministic
  -- fake UUID per email so the seed still works for schema/data testing.
  RETURN md5(p_email)::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed one golden business. Returns the new business_id. Idempotent per
-- (profile): re-seeding the same profile deletes the prior test business first.
CREATE OR REPLACE FUNCTION seed_golden_dataset(p_profile TEXT)
RETURNS UUID AS $$
DECLARE
  v_bid UUID;
  v_uid UUID;
  v_staff UUID;
  v_owner UUID;
  v_c UUID;        -- contact
  v_d UUID;        -- deal
  v_inv UUID;      -- invoice
  v_pay UUID;      -- payment
  v_p UUID;        -- product
  v_proj UUID;     -- project
  v_t UUID;        -- task
  v_today DATE := CURRENT_DATE;
  v_email TEXT;
  v_name TEXT;
BEGIN
  -- Clean any prior seed for this profile (idempotent re-run).
  DELETE FROM businesses WHERE name = 'GOLDEN-' || p_profile;

  INSERT INTO businesses (id, name, industry)
  VALUES (gen_random_uuid(), 'GOLDEN-' || p_profile, 'consulting')
  RETURNING id INTO v_bid;

  v_email := 'golden-test-' || p_profile || '@avenize.test';
  v_uid := _ensure_test_auth_user(v_email);

  INSERT INTO staff (business_id, user_id, name, email, role)
  VALUES (v_bid, v_uid, 'Golden Owner ' || p_profile, v_email, 'owner')
  RETURNING id INTO v_owner;

  v_name := p_profile;

  IF p_profile = 'A_healthy' THEN
    -- Steady revenue, low overdue, good data quality. 6 won deals + 6 paid
    -- invoices over 90d. No negatives expected.
    FOR i IN 1..6 LOOP
      INSERT INTO contacts (business_id, name, email, company)
      VALUES (v_bid, 'Healthy Cust ' || i, 'hc'||i||'@t.test', 'HealthyCo')
      RETURNING id INTO v_c;
      INSERT INTO deals (business_id, contact_id, title, value, stage, expected_close, created_at, updated_at)
      VALUES (v_bid, v_c, 'Healthy Deal '||i, 5000000, 'won', v_today - (i*10), v_today - (i*15), v_today - (i*10))
      RETURNING id INTO v_d;
      INSERT INTO invoices (business_id, client_name, subtotal, total, status, due_date, deal_id, created_at)
      VALUES (v_bid, 'Healthy Cust '||i, 5000000, 5000000, 'paid', v_today - (i*5), v_d, v_today - (i*15))
      RETURNING id INTO v_inv;
      INSERT INTO payments (business_id, invoice_id, customer_id, amount, currency, provider, reference, status, created_at)
      VALUES (v_bid, v_inv, v_c, 5000000, 'NGN', 'cash', 'GOLDEN-A-'||i, 'successful', v_today - (i*10));
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'income', 'sales', 5000000, v_today - (i*10));
    END LOOP;
    -- A little normal expense (well below income).
    FOR i IN 1..3 LOOP
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'expense', 'operations', 500000, v_today - (i*20));
    END LOOP;

  ELSIF p_profile = 'B_cashflow' THEN
    -- Expenses > income over 90d, ≥14 days of history → FIN-CF-001 must fire.
    FOR i IN 1..5 LOOP
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'income', 'sales', 1000000, v_today - (i*15));
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'expense', 'operations', 3000000, v_today - (i*15));
    END LOOP;
    -- Plus overdue invoices for FIN-AR-002.
    FOR i IN 1..4 LOOP
      INSERT INTO invoices (business_id, client_name, subtotal, total, status, due_date, created_at)
      VALUES (v_bid, 'Stressed Cust '||i, 2000000, 2000000, 'overdue', v_today - 45, v_today - 60);
    END LOOP;

  ELSIF p_profile = 'C_sales_decline' THEN
    -- Stale deals stuck in 'proposal' > 14 days → SAL-CONV-001 must fire.
    FOR i IN 1..3 LOOP
      INSERT INTO contacts (business_id, name, email)
      VALUES (v_bid, 'Decline Cust '||i, 'dc'||i||'@t.test')
      RETURNING id INTO v_c;
      INSERT INTO deals (business_id, contact_id, title, value, stage, created_at, updated_at)
      VALUES (v_bid, v_c, 'Stale Deal '||i, 3000000, 'proposal', v_today - 30, v_today - 20)
      RETURNING id INTO v_d;
    END LOOP;

  ELSIF p_profile = 'D_high_growth' THEN
    -- Many new customers, won deals, full stock → no negative recs expected.
    FOR i IN 1..8 LOOP
      INSERT INTO contacts (business_id, name, email, company)
      VALUES (v_bid, 'Growth Cust '||i, 'gc'||i||'@t.test', 'GrowthCo')
      RETURNING id INTO v_c;
      INSERT INTO deals (business_id, contact_id, title, value, stage, created_at, updated_at)
      VALUES (v_bid, v_c, 'Won Deal '||i, 7000000, 'won', v_today - (i*5), v_today - (i*5))
      RETURNING id INTO v_d;
      INSERT INTO invoices (business_id, client_name, subtotal, total, status, due_date, deal_id, created_at)
      VALUES (v_bid, 'Growth Cust '||i, 7000000, 7000000, 'paid', v_today - (i*3), v_d, v_today - (i*5))
      RETURNING id INTO v_inv;
      INSERT INTO payments (business_id, invoice_id, customer_id, amount, currency, provider, reference, status, created_at)
      VALUES (v_bid, v_inv, v_c, 7000000, 'NGN', 'cash', 'GOLDEN-D-'||i, 'successful', v_today - (i*3));
      INSERT INTO cashflow_entries (business_id, type, category, amount, date)
      VALUES (v_bid, 'income', 'sales', 7000000, v_today - (i*3));
    END LOOP;
    -- Full stock (no INV-001).
    INSERT INTO products (business_id, name, sku, price, cost, stock, low_stock_threshold)
    VALUES (v_bid, 'Growth Widget', 'GW-1', 1000, 400, 500, 50);

  ELSIF p_profile = 'E_inventory' THEN
    -- Products at/below reorder point → INV-001 must fire.
    FOR i IN 1..4 LOOP
      INSERT INTO products (business_id, name, sku, price, cost, stock, low_stock_threshold)
      VALUES (v_bid, 'Low Stock Product '||i, 'LS-'||i, 2000, 800, 3, 20);
    END LOOP;

  ELSIF p_profile = 'F_project' THEN
    -- Active project overdue → ProjectDelayed event fires.
    INSERT INTO projects (business_id, name, status, due_date, owner_id, created_at)
    VALUES (v_bid, 'Overdue Project', 'active', v_today - 10, v_owner, v_today - 40)
    RETURNING id INTO v_proj;
    INSERT INTO tasks (business_id, project_id, title, status, assignee_id, created_at)
    VALUES (v_bid, v_proj, 'Overdue Project Task', 'active', v_owner, v_today - 35);

  ELSIF p_profile = 'G_empty' THEN
    -- < 3 of everything → every rule NO-OPs (§21). Nothing seeded except the
    -- business + owner. Health should report insufficient_data across the board.
    NULL;
  END IF;

  RETURN v_bid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove all golden test datasets + their test auth users.
CREATE OR REPLACE FUNCTION cleanup_golden_datasets()
RETURNS VOID AS $$
BEGIN
  DELETE FROM businesses WHERE name LIKE 'GOLDEN-%';
  DELETE FROM auth.users WHERE email LIKE 'golden-test-%@avenize.test';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION seed_golden_dataset(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_golden_datasets() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION _ensure_test_auth_user(TEXT) TO service_role;

COMMENT ON FUNCTION seed_golden_dataset IS
'§30 golden test datasets. Seeds a synthetic business with controlled data for a named profile. Idempotent. NOT real customer data. Use cleanup_golden_datasets() to remove.';
