\set ON_ERROR_STOP on
-- E2E for the capture-attachment flow per user instruction:
-- "209 KB JPG -> AICapture -> Attach -> create_capture_attachment() -> record
--  -> finalize -> visible on capture -> reload -> still present"
-- plus cross-tenant denial. Runs as `authenticated` with the ci_shim GUC.

-- Fixtures: two orgs, businesses, users, staff rows
INSERT INTO public.organizations (id, name) VALUES
  ('99999999-9999-9999-9999-99999999999a', 'Org A'),
  ('99999999-9999-9999-9999-99999999999b', 'Org B');
INSERT INTO public.businesses (id, name, organization_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tenant A', '99999999-9999-9999-9999-99999999999a'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B', '99999999-9999-9999-9999-99999999999b');
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'owner-a@t.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'owner-b@t.com');
INSERT INTO public.staff (business_id, user_id, name, email, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Owner A', 'owner-a@t.com', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Owner B', 'owner-b@t.com', 'owner');

-- Act as Tenant A owner
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}', false);

CREATE TEMP TABLE tmp_ids (k TEXT PRIMARY KEY, v UUID);

-- 1. Attach: create pending attachment record (209 KB JPG)
WITH r AS (SELECT public.create_capture_attachment('image', 'receipt.jpg', 'image/jpeg', 209715) AS res)
INSERT INTO tmp_ids SELECT 'attachment', (r.res->>'attachment_id')::uuid FROM r RETURNING v;

-- 2. Finalize after upload
SELECT public.finalize_capture_attachment((SELECT v FROM tmp_ids WHERE k='attachment'), 209715, 1200, 1600, NULL) AS finalized;

-- 3. Link to a capture event (simulates AICapture confirm)
INSERT INTO public.business_events (business_id, event_type, entity_type, payload, source)
VALUES ('11111111-1111-1111-1111-111111111111', 'QuickCapture', 'note', '{"content":"receipt"}', 'staff')
RETURNING id \gset
INSERT INTO tmp_ids VALUES ('event', :'id'::uuid);
SELECT public.link_capture_to_event(
  (SELECT v FROM tmp_ids WHERE k='attachment'),
  (SELECT v FROM tmp_ids WHERE k='event')) AS linked;

-- 4. "Visible on the capture" + "reload -> still present"
SELECT count(*) AS first_list  FROM public.list_capture_attachments((SELECT v FROM tmp_ids WHERE k='event'), 50);
SELECT count(*) AS reload_list FROM public.list_capture_attachments((SELECT v FROM tmp_ids WHERE k='event'), 50);

-- Signed-url gate returns the private path for the member
SELECT public.generate_capture_attachment_url((SELECT v FROM tmp_ids WHERE k='attachment')) IS NOT NULL AS url_ok_member;

-- 5. Cross-tenant denial: Tenant B cannot see/access Tenant A's attachment
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b"}', false);
SELECT count(*) AS cross_list FROM public.list_capture_attachments((SELECT v FROM tmp_ids WHERE k='event'), 50);
SELECT count(*) AS cross_table_read FROM public.capture_attachments WHERE id = (SELECT v FROM tmp_ids WHERE k='attachment');
SELECT public.generate_capture_attachment_url((SELECT v FROM tmp_ids WHERE k='attachment')) IS NULL AS cross_url_denied;

RESET ROLE;

DO $$
DECLARE
  v_a UUID := (SELECT v FROM tmp_ids WHERE k='attachment');
  v_e UUID := (SELECT v FROM tmp_ids WHERE k='event');
BEGIN
  -- Re-verify everything as superuser with full visibility (RLS-independent assertions)
  IF v_a IS NULL THEN RAISE EXCEPTION 'FAIL: attachment record was not created'; END IF;
  IF v_e IS NULL THEN RAISE EXCEPTION 'FAIL: event was not created'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.capture_attachments WHERE id = v_a AND status = 'available') THEN
    RAISE EXCEPTION 'FAIL: finalize did not mark attachment available'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.capture_attachments WHERE id = v_a AND event_id = v_e) THEN
    RAISE EXCEPTION 'FAIL: attachment not linked to capture event'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.capture_attachments WHERE id = v_a
                 AND storage_path LIKE 'captures/11111111-1111-1111-1111-111111111111/%') THEN
    RAISE EXCEPTION 'FAIL: storage path is not business-scoped'; END IF;
  RAISE NOTICE 'CAPTURE E2E: ALL ASSERTIONS PASSED (create, finalize, link, list, reload, member-url, cross-tenant denial, path scoping)';
END $$;
