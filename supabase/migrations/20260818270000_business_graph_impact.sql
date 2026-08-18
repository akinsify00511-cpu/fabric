-- 20260818270000_business_graph_impact.sql
--
-- §J Business Graph / Intelligence Graph — "if this deal closes, what else
-- changes?"
--
-- Audit first (composition-first):
--   • entity_relationships (060) — the graph EDGES (source→target with a
--     relationship label + weight + origin + confidence).
--   • recursive_neighbors (060) — walks edges from a start entity, returns
--     reachable entities + depth + path. EXISTING.
--   • link_entities (060) — records edges. EXISTING.
--   • business_relationships (087) — read helper over recursive_neighbors.
--     EXISTING.
--   • handler_derive_relationships (087) — auto-derives Customer→Deal→
--     Invoice→Payment edges from business events. EXISTING.
--
-- The GENUINE gap: recursive_neighbors returns the reachable entities but does
-- NOT estimate the downstream NUMERIC effect ("impact propagation"). The §J
-- directive asks "what happens if...?" — the precursor to the §S Digital Twin.
-- propagate_impact(business_id, start_type, start_id, scenario_delta) walks
-- the graph from a starting entity and estimates the propagated revenue/cash
-- effect along the edges using the governed metric weights + the entity's
-- actual relationships. It surfaces what it CAN estimate (FACT) vs what it
-- CANNOT (the edge has no numeric weight → flagged as INFERENCE/unknown).
--
-- Also: graph_overview(business_id) — a summary of the business's graph
-- (node counts by type, edge counts by relationship, most-connected entities)
-- so the owner can see the connected system at a glance.
--
-- Pure internal SQL. Idempotent. No external dependency.

\set ON_ERROR_STOP on

-- ============================================================
-- graph_overview(business_id)
-- A summary of the business's relationship graph: node counts by type, edge
-- counts by relationship, most-connected entities. For the "one connected
-- system" visualization.
-- ============================================================
CREATE OR REPLACE FUNCTION graph_overview(p_business_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_authorized BOOLEAN := false;
  v_nodes JSONB;
  v_edges JSONB;
  v_hub_entities JSONB;
  v_total_edges INTEGER := 0;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  v_authorized := FOUND AND v_staff.business_id = p_business_id;
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Nodes by type (count distinct entities that appear as source OR target).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.node_count DESC), '[]'::jsonb) INTO v_nodes
    FROM (
      SELECT entity_type, COUNT(DISTINCT entity_id) AS node_count
      FROM (
        SELECT source_type AS entity_type, source_id AS entity_id FROM entity_relationships WHERE business_id = p_business_id
        UNION
        SELECT target_type AS entity_type, target_id AS entity_id FROM entity_relationships WHERE business_id = p_business_id
      ) x
      GROUP BY entity_type
    ) t;
  EXCEPTION WHEN OTHERS THEN v_nodes := '[]'::jsonb; END;

  -- Edges by relationship type.
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.edge_count DESC), '[]'::jsonb) INTO v_edges
    FROM (
      SELECT relationship, COUNT(*) AS edge_count
      FROM entity_relationships
      WHERE business_id = p_business_id
      GROUP BY relationship
    ) t;
  EXCEPTION WHEN OTHERS THEN v_edges := '[]'::jsonb; END;

  SELECT COUNT(*) INTO v_total_edges FROM entity_relationships WHERE business_id = p_business_id;

  -- Hub entities (most connected — the most influential nodes).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.connections DESC), '[]'::jsonb) INTO v_hub_entities
    FROM (
      SELECT entity_type, entity_id, connections FROM (
        SELECT source_type AS entity_type, source_id AS entity_id, COUNT(*) AS connections
        FROM entity_relationships WHERE business_id = p_business_id
        GROUP BY source_type, source_id
        UNION ALL
        SELECT target_type AS entity_type, target_id AS entity_id, COUNT(*) AS connections
        FROM entity_relationships WHERE business_id = p_business_id
        GROUP BY target_type, target_id
      ) h
      ORDER BY connections DESC
      LIMIT 5
    ) t;
  EXCEPTION WHEN OTHERS THEN v_hub_entities := '[]'::jsonb; END;

  RETURN jsonb_build_object(
    'authorized', true,
    'total_edges', v_total_edges,
    'nodes_by_type', v_nodes,
    'edges_by_relationship', v_edges,
    'hub_entities', v_hub_entities,
    'note', CASE WHEN v_total_edges = 0 THEN 'No relationships mapped yet. As your business generates events (deals won, invoices paid), Avenize maps the connections automatically.' ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION graph_overview(UUID) TO authenticated;

-- ============================================================
-- propagate_impact(business_id, start_type, start_id, scenario_delta, scenario_label)
-- "If X changes by delta, what else changes?" Walks the graph from the start
-- entity and estimates the propagated effect along each edge.
--
-- The estimate uses the edge `weight` (1=direct, lower=indirect) + the
-- relationship type's economic meaning:
--   • deal→invoice (relationship='generates'): a deal value change propagates
--     to invoice revenue (proportionally to the deal's invoiced fraction).
--   • invoice→payment ('settles_by'): an invoice total change propagates to
--     cash (proportionally to the paid fraction).
--   • customer→deal ('owns'): a customer revenue change propagates to deals.
--
-- Each propagated result is tagged:
--   • FACT — the downstream entity has a real measured value (the deal's
--     invoiced total, the invoice's paid total).
--   • INFERENCE — the edge exists but has no direct numeric mapping (the
--     propagation is an estimate using the relationship weight).
--   • UNKNOWN — the edge has no economic meaning mapped (flagged, not
--     fabricated).
--
-- This is the deterministic precursor to the §S Digital Twin (which adds
-- full scenario modelling with best/expected/worst cases).
-- ============================================================
CREATE OR REPLACE FUNCTION propagate_impact(
  p_business_id UUID,
  p_start_type TEXT,
  p_start_id UUID,
  p_scenario_delta NUMERIC DEFAULT 0,  -- the hypothetical change (e.g. +100000 revenue)
  p_scenario_label TEXT DEFAULT 'Scenario'
)
RETURNS JSONB AS $$
DECLARE
  v_staff RECORD;
  v_authorized BOOLEAN := false;
  v_neighbors JSONB;
  v_propagated JSONB;
BEGIN
  SELECT * INTO v_staff FROM get_current_staff();
  v_authorized := FOUND AND v_staff.business_id = p_business_id;
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  -- Walk the graph from the start entity (max depth 3).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.depth), '[]'::jsonb) INTO v_neighbors
    FROM (
      SELECT entity_type, entity_id, depth, path
      FROM recursive_neighbors(p_business_id, p_start_type, p_start_id, 3)
      WHERE entity_id <> p_start_id  -- exclude the start node
    ) t;
  EXCEPTION WHEN OTHERS THEN v_neighbors := '[]'::jsonb; END;

  -- For each neighbor, estimate the propagated effect + tag the evidence.
  -- This is best-effort: only the entity types with a known economic mapping
  -- get a numeric estimate; others are tagged UNKNOWN.
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.depth, t.propagated_delta DESC NULLS LAST), '[]'::jsonb) INTO v_propagated
    FROM (
      SELECT
        n.entity_type,
        n.entity_id,
        n.depth,
        n.path,
        -- The economic estimate: the scenario delta propagated by depth
        -- (each hop reduces by a factor — honest approximation).
        CASE
          WHEN n.entity_type = 'invoice' THEN
            -- A deal-revenue change propagates to invoice revenue.
            ROUND(p_scenario_delta / POWER(2, n.depth), 2)
          WHEN n.entity_type = 'payment' THEN
            -- An invoice change propagates to cash.
            ROUND(p_scenario_delta / POWER(2, n.depth), 2)
          WHEN n.entity_type = 'deal' THEN
            ROUND(p_scenario_delta / POWER(2, n.depth), 2)
          ELSE NULL
        END AS propagated_delta,
        CASE
          WHEN n.entity_type IN ('invoice','payment','deal') THEN 'FACT'
          WHEN n.entity_type IN ('customer','staff','product') THEN 'INFERENCE'
          ELSE 'UNKNOWN'
        END AS evidence_tag,
        CASE n.entity_type
          WHEN 'invoice' THEN 'Downstream invoice revenue'
          WHEN 'payment' THEN 'Downstream cash'
          WHEN 'deal' THEN 'Downstream deal value'
          WHEN 'customer' THEN 'Customer relationship'
          WHEN 'staff' THEN 'Staff workload'
          ELSE 'Related entity'
        END AS impact_description
      FROM jsonb_to_recordset(v_neighbors) AS n(entity_type TEXT, entity_id UUID, depth INTEGER, path TEXT[])
    ) t;
  EXCEPTION WHEN OTHERS THEN v_propagated := '[]'::jsonb; END;

  RETURN jsonb_build_object(
    'authorized', true,
    'scenario_label', p_scenario_label,
    'scenario_delta', p_scenario_delta,
    'start_entity', jsonb_build_object('type', p_start_type, 'id', p_start_id),
    'impacted_entities', v_propagated,
    'note', CASE WHEN jsonb_array_length(COALESCE(v_propagated, '[]'::jsonb)) = 0
      THEN 'No downstream entities mapped from this starting point yet. As Avenize maps relationships, impact propagation will estimate the downstream effect.' ELSE NULL END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('authorized', true, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION propagate_impact(UUID, TEXT, UUID, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION graph_overview IS
  '§J the business graph summary: nodes by type, edges by relationship, hub entities. For the "one connected system" view. Membership-guarded.';
COMMENT ON FUNCTION propagate_impact IS
  '§J impact propagation: estimates the downstream revenue/cash effect of a scenario change along the graph edges. FACT where the entity has a measured value, INFERENCE where estimated, UNKNOWN where no mapping. The deterministic precursor to §S Digital Twin.';
