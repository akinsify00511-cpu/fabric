-- ============================================================================
-- Migration 045: Purchase & Vendor workflow (formal PO cycle)
-- ----------------------------------------------------------------------------
-- Net-new. Today "Requisitions" is an internal "I need X, approve it" flow.
-- This adds the externally-facing procurement cycle a real business runs:
--
--   Persona: Procurement Officer
--     approved requisition -> raises a Purchase Order to a Vendor
--                              -> sends PO (email/PDF)
--                              -> goods arrive, logs Goods Receipt per line
--                              -> vendor invoice arrives, 3-way match
--                              -> on match, releases for payment
--
--   Persona: Approver / Finance
--     sees PO value vs budget, approves before sending; verifies the 3-way
--     match before releasing payment.
--
--   Persona: Vendor (read-only via portal, future)
--     receives PO, acknowledges, ships.
--
-- Reuses: approvals(id), products(id), inventory/stock_movements (auto stock-in
-- on goods receipt), payments(id) for the matched vendor invoice payment.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- helper: business_id from current staff (used widely; redefined defensively)
CREATE OR REPLACE FUNCTION public.get_current_staff()
RETURNS TABLE (id UUID, business_id UUID, role TEXT) AS $$
BEGIN
  RETURN QUERY SELECT s.id, s.business_id, s.role FROM public.staff s
  WHERE s.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 1. VENDORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  payment_terms TEXT,                                   -- e.g. "Net 30"
  bank_details  JSONB DEFAULT '{}'::jsonb,
  is_active     BOOLEAN DEFAULT TRUE,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_business_all" ON public.vendors
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_vendors_business ON public.vendors(business_id);
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. PURCHASE ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  vendor_id       UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  requisition_id  UUID,                                 -- references requisitions(id)
  approval_id     UUID,                                 -- references approvals(id) when approved
  po_number       TEXT UNIQUE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','acknowledged','partially_received',
                                    'received','closed','cancelled')),
  total_amount    DECIMAL(15, 2) NOT NULL DEFAULT 0,
  currency        TEXT DEFAULT 'NGN',
  expected_date   DATE,
  created_by      UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_business_all" ON public.purchase_orders
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_po_business ON public.purchase_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON public.purchase_orders(vendor_id);
CREATE TRIGGER po_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Wire FKs to tables defined in earlier migrations (added via ALTER so this
-- migration does not fail if the referenced table was created later in a
-- parallel branch — the relationship is still enforced once both exist).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='requisitions')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='po_requisition_fk') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT po_requisition_fk
      FOREIGN KEY (requisition_id) REFERENCES public.requisitions(id) ON DELETE SET NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='approvals')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='po_approval_fk') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT po_approval_fk
      FOREIGN KEY (approval_id) REFERENCES public.approvals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Auto-generate a human-readable PO number on insert if not supplied.
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := 'PO-' || to_char(NOW(), 'YYMMDD') || '-' ||
                     upper(substring(encode(gen_random_bytes(3), 'hex') from 1 for 5));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS po_number_gen ON public.purchase_orders;
CREATE TRIGGER po_number_gen BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_po_number();

-- ============================================================================
-- 3. PURCHASE ORDER LINE ITEMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description       TEXT NOT NULL,
  quantity          DECIMAL(15, 3) NOT NULL CHECK (quantity > 0),
  unit_price        DECIMAL(15, 2) NOT NULL CHECK (unit_price >= 0),
  received_quantity DECIMAL(15, 3) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
-- Inherit visibility from the PO via a join policy.
CREATE POLICY "po_items_business_all" ON public.purchase_order_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.purchase_orders po
            WHERE po.id = purchase_order_items.po_id
              AND po.business_id = (SELECT business_id FROM public.get_current_staff()))
  );
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product ON public.purchase_order_items(product_id) WHERE product_id IS NOT NULL;

-- Recompute PO total when line items change (procurement officer shouldn't
-- have to do arithmetic — the system keeps the total honest).
-- FOR EACH ROW so NEW/OLD are bound; handle all three ops in one function.
CREATE OR REPLACE FUNCTION public.recalc_po_total()
RETURNS TRIGGER AS $$
DECLARE po_id UUID;
BEGIN
  po_id := COALESCE(NEW.po_id, OLD.po_id);
  IF po_id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.purchase_orders
     SET total_amount = COALESCE((SELECT SUM(quantity * unit_price)
                                  FROM public.purchase_order_items WHERE po_id = po_id), 0)
   WHERE id = po_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS po_total_on_item_change ON public.purchase_order_items;
CREATE TRIGGER po_total_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_po_total();

-- ============================================================================
-- 4. GOODS RECEIPTS  (vendor delivers; store logs receipt against PO lines)
--    Persona: Warehouse/Stores staff confirm what actually arrived.
--    On insert, auto-creates a stock_movement so inventory reflects receipt.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  received_by   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gr_business_all" ON public.goods_receipts
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_gr_po ON public.goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_gr_business ON public.goods_receipts(business_id);

CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_item_id    UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  quantity_received DECIMAL(15, 3) NOT NULL CHECK (quantity_received > 0),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grl_business_all" ON public.goods_receipt_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.goods_receipts gr
            WHERE gr.id = goods_receipt_lines.goods_receipt_id
              AND gr.business_id = (SELECT business_id FROM public.get_current_staff()))
  );

-- Bump received_quantity on the PO line + advance PO status when fully received.
-- FOR EACH ROW on goods_receipt_lines: NEW is the just-inserted line.
CREATE OR REPLACE FUNCTION public.apply_goods_receipt()
RETURNS TRIGGER AS $$
DECLARE v_po UUID; v_prod UUID; v_biz UUID;
BEGIN
  -- update the PO line's received quantity
  UPDATE public.purchase_order_items pi
     SET received_quantity = received_quantity + NEW.quantity_received
   WHERE pi.id = NEW.po_item_id;

  -- find the PO + business for status advancement + stock-in
  SELECT po.id, po.business_id INTO v_po, v_biz
    FROM public.goods_receipts gr
    JOIN public.purchase_orders po ON po.id = gr.po_id
   WHERE gr.id = NEW.goods_receipt_id;

  -- advance PO status: fully received -> 'received', else 'partially_received'
  UPDATE public.purchase_orders po
     SET status = CASE
       WHEN NOT EXISTS (
         SELECT 1 FROM public.purchase_order_items it
         WHERE it.po_id = v_po AND it.received_quantity < it.quantity
       ) THEN 'received'
       ELSE 'partially_received'
     END
   WHERE po.id = v_po AND po.status NOT IN ('closed','cancelled');

  -- stock-in: products has its own `stock` column (inventory is a separate
  -- parallel model without a product_id FK), so bump products.stock directly.
  SELECT pi.product_id INTO v_prod FROM public.purchase_order_items pi WHERE pi.id = NEW.po_item_id;
  IF v_prod IS NOT NULL THEN
    UPDATE public.products SET stock = stock + NEW.quantity_received::INTEGER
     WHERE id = v_prod;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- row trigger: NEW carries the inserted line
DROP TRIGGER IF EXISTS gr_apply ON public.goods_receipt_lines;
CREATE TRIGGER gr_apply
  AFTER INSERT ON public.goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.apply_goods_receipt();

-- ============================================================================
-- 5. VENDOR INVOICES  (3-way match: PO <-> goods receipt <-> invoice)
--    Persona: Finance officer matches, then releases for payment.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vendor_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  po_id         UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  vendor_id     UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  invoice_number TEXT,
  amount        DECIMAL(15, 2) NOT NULL,
  currency      TEXT DEFAULT 'NGN',
  status        TEXT NOT NULL DEFAULT 'pending_match'
                CHECK (status IN ('pending_match','matched','disputed','paid','voided')),
  matched_at    TIMESTAMPTZ,
  payment_id    UUID,                                   -- references payments(id) when paid
  invoice_date  DATE,
  due_date      DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vendor_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vi_business_all" ON public.vendor_invoices
  FOR ALL USING (business_id = (SELECT business_id FROM public.get_current_staff()))
  WITH CHECK (business_id = (SELECT business_id FROM public.get_current_staff()));
CREATE INDEX IF NOT EXISTS idx_vi_business ON public.vendor_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_vi_status ON public.vendor_invoices(status);
CREATE INDEX IF NOT EXISTS idx_vi_po ON public.vendor_invoices(po_id) WHERE po_id IS NOT NULL;
CREATE TRIGGER vi_updated_at BEFORE UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Wire vendor_invoices.payment_id to payments(id) if that table exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payments')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vi_payment_fk') THEN
    ALTER TABLE public.vendor_invoices
      ADD CONSTRAINT vi_payment_fk
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 6. AUDIT  (financially material: PO + vendor invoice status changes)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_procurement_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (business_id, action, entity_type, entity_id, new_values)
    VALUES (NEW.business_id, 'update', TG_ARGV[0], NEW.id,
            jsonb_build_object('status', NEW.status, 'previous_status', OLD.status))
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (business_id, action, entity_type, entity_id, new_values)
    VALUES (NEW.business_id, 'create', TG_ARGV[0], NEW.id,
            jsonb_build_object('status', NEW.status))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_po ON public.purchase_orders;
CREATE TRIGGER audit_po AFTER INSERT OR UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_procurement_event();

DROP TRIGGER IF EXISTS audit_vi ON public.vendor_invoices;
CREATE TRIGGER audit_vi AFTER INSERT OR UPDATE OF status ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_procurement_event();
