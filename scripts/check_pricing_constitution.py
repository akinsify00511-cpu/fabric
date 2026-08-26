#!/usr/bin/env python3
"""Enforce the Avenize One Pricing Constitution.

The plan vocabulary and the kobo prices must be IDENTICAL across every
authoritative source, or a customer sees one price on the pricing page and
gets charged another at checkout — a P0 contract violation (money contract).

Authoritative sources compared:
  1. supabase/migrations/20260818200000_pricing_engine.sql  the pricing_tiers seed
  2. src/pages/Pricing.tsx                                   the FALLBACK_TIERS the
                                                             frontend renders offline
  3. supabase/functions/subscription-management/index.ts     VALID_PLANS (server)
  4. supabase/functions/_shared/paymentsCore.ts              PLAN_DISPLAY_NAMES
  5. supabase/migrations/20260822125000_manual_payment_flow.sql  plan_price_cents

Canonical vocabulary (the ONE pricing constitution — NOT configurable per page):
  starter  team  business  pro  scale
(enterprise is an accepted alias for bespoke arrangements, never a competing
public tier. professional/growth are NOT in the public vocabulary.)

Exit code: 0 = constitution holds, 1 = violation.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CANONICAL_PLANS = ["starter", "team", "business", "pro", "scale"]
ALIAS_PLANS = {"enterprise"}

MIGRATION_PRICE = ROOT / "supabase" / "migrations" / "20260818200000_pricing_engine.sql"
MANUAL_PAY = ROOT / "supabase" / "migrations" / "20260822125000_manual_payment_flow.sql"
PRICING_TSX = ROOT / "src" / "pages" / "Pricing.tsx"
EDGE_INDEX = ROOT / "supabase" / "functions" / "subscription-management" / "index.ts"
PAYMENTS_CORE = ROOT / "supabase" / "functions" / "_shared" / "paymentsCore.ts"

# plan_code -> (monthly_cents, yearly_cents) from the pricing_tiers seed.
def parse_migration_prices(text):
    prices = {}
    # Rows look like  ('starter', 'Starter', '...', 1500000, 15000000, ...)
    for m in re.finditer(
        r"\(\s*'([a-z_]+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,"
        r"\s*ARRAY\[[^\]]*\]\s*,\s*(\d+)\s*,\s*(\d+)",
        text,
        re.IGNORECASE | re.DOTALL,
    ):
        prices[m.group(1)] = (int(m.group(2)), int(m.group(3)))
    return prices


def parse_frontend_prices(text):
    prices = {}
    for m in re.finditer(
        r"plan_code:\s*'([a-z_]+)'[^}]*?monthly_cents:\s*(\d+)\s*,\s*yearly_cents:\s*(\d+)",
        text,
        re.IGNORECASE,
    ):
        prices[m.group(1)] = (int(m.group(2)), int(m.group(3)))
    return prices


def parse_edge_plans(text):
    m = re.search(r"VALID_PLANS\s*=\s*\[([^\]]+)\]", text)
    if not m:
        return None
    return [p.strip().strip("'\"") for p in m.group(1).split(",") if p.strip()]


def parse_display_names(text):
    m = re.search(r"PLAN_DISPLAY_NAMES\s*:\s*Record<string, string>\s*=\s*\{(.*?)\}", text, re.DOTALL)
    if not m:
        return None
    return list(re.findall(r"\b([a-z_]+)\s*:\s*'", m.group(1)))


def main():
    violations = []
    edge_text = EDGE_INDEX.read_text(encoding="utf-8", errors="replace") if EDGE_INDEX.exists() else ""
    core_text = PAYMENTS_CORE.read_text(encoding="utf-8", errors="replace") if PAYMENTS_CORE.exists() else ""
    mig_text = MIGRATION_PRICE.read_text(encoding="utf-8", errors="replace") if MIGRATION_PRICE.exists() else ""
    front_text = PRICING_TSX.read_text(encoding="utf-8", errors="replace") if PRICING_TSX.exists() else ""
    manual_text = MANUAL_PAY.read_text(encoding="utf-8", errors="replace") if MANUAL_PAY.exists() else ""

    mig_prices = parse_migration_prices(mig_text)
    front_prices = parse_frontend_prices(front_text)
    edge_plans = parse_edge_plans(edge_text)
    display_names = parse_display_names(core_text)
    rpc_uses = set(re.findall(r"plan_price_cents", manual_text + edge_text + front_text))

    # --- 1. Canonical vocabulary must be exactly the canonical set (minus aliases) ---
    def check_vocab(label, plans):
        if plans is None:
            violations.append(f"{label}: could not locate plan vocabulary")
            return
        extra = [p for p in plans if p not in CANONICAL_PLANS and p not in ALIAS_PLANS]
        # allowed to include canonical + extra alias codes, but never a
        # non-canonical, non-alias public plan.
        if extra:
            violations.append(f"{label}: non-canonical plan code(s) {extra} (canonical={CANONICAL_PLANS}, aliases={sorted(ALIAS_PLANS)})")

    check_vocab("migration pricing_tiers seed", list(mig_prices.keys()))
    check_vocab("frontend FALLBACK tiers", list(front_prices.keys()))
    check_vocab("edge VALID_PLANS", edge_plans)
    check_vocab("paymentsCore PLAN_DISPLAY_NAMES", display_names)

    # --- 2. Every canonical plan must exist in every source ---
    missing_cols = {c: [] for c in ("migration", "frontend", "edge", "display_names")}
    for p in CANONICAL_PLANS:
        if p not in mig_prices:
            missing_cols["migration"].append(p)
        if p not in front_prices:
            missing_cols["frontend"].append(p)
        if edge_plans is not None and p not in edge_plans:
            missing_cols["edge"].append(p)
        if display_names is not None and p not in display_names:
            missing_cols["display_names"].append(p)
    for col, plans in missing_cols.items():
        if plans:
            violations.append(f"{col}: missing canonical plan(s) {plans}")

    # --- 3. Prices must agree between frontend fallback and the DB seed ---
    for p in CANONICAL_PLANS:
        if p in front_prices and p in mig_prices and front_prices[p] != mig_prices[p]:
            violations.append(
                f"pricing mismatch for '{p}': frontend={front_prices[p]} vs migration={mig_prices[p]}"
            )

    # --- 4. Server must price via plan_price_cents (browser never prices) ---
    if "plan_price_cents" not in rpc_uses:
        violations.append("no plan_price_cents reference found anywhere (server-side price lookup)")

    print("Avenize One Pricing Constitution")
    print("─" * 34)
    print(f"canonical plans : {' '.join(CANONICAL_PLANS)}")
    print(f"migration prices: {json.dumps({k: v for k, v in mig_prices.items() if k in CANONICAL_PLANS})}")
    print(f"frontend prices : {json.dumps({k: v for k, v in front_prices.items() if k in CANONICAL_PLANS})}")
    print(f"edge VALID_PLANS: {edge_plans}")
    print(f"display names   : {display_names}")
    print(f"plan_price_cents found: {bool(rpc_uses)}")
    if violations:
        print("\nVIOLATIONS:")
        for v in violations:
            print(f"  - {v}")
        print("\nRESULT: PRICING CONSTITUTION BROKEN")
        sys.exit(1)
    print("\nRESULT: PRICING CONSTITUTION HOLDS")
    sys.exit(0)


if __name__ == "__main__":
    main()