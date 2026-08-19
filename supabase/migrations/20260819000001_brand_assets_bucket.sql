-- Keep the frontend's existing brand-assets Storage dependency represented in
-- migration history so fresh environments and schema-drift checks agree.
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;
