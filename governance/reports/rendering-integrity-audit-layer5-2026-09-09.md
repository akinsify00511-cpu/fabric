# Avenize Rendering Integrity Audit — Layer 5

**Date:** 2026-09-09  
**Branch:** `audit/feature-operational-audit-2026-09-09`  
**Scope:** Demand requests/orders, inventory movement integrity and cross-surface business-state claims.  
**Mode:** Audit only. No product repairs performed.

## Confirmed findings

### 1. Requests — read failure is rendered as an empty demand inbox — P1 / FAIL

`fetchRequests()` returns `[]` when the Supabase query fails. `Requests.tsx` then renders **“No requests yet”** and the footer instruction. A data-access failure is therefore indistinguishable from no customer demand.

### 2. Orders — read failure is rendered as an empty order book — P1 / FAIL

`fetchOrders()` has the same best-effort `[]` fallback. `SalesOrders.tsx` consequently renders **“No orders yet”** after an order-read failure instead of an explicit unavailable/error state.

### 3. Orders — order-value headline has no period/scope disclosure — P1 / PARTIAL

The order-value and in-fulfilment counts are calculated over every loaded order for the business, with no reporting-period selector or scope label. The headline can be interpreted as current-period performance even though it is an all-loaded-lifetime aggregate.

### 4. Requests — workflow copy overstates automation — P1 / PARTIAL

The empty-state tip says requests “flow into quotes and orders automatically,” while the observed code exposes explicit creation/transition operations and the order page says orders are converted from accepted quotes/direct actions. The user-facing statement should describe the actual transition mechanism rather than imply autonomous conversion.

### 5. Inventory — stock quantity update is not transactionally coupled to movement creation — P0 / FAIL

`recordMovement()` first updates `inventory.quantity` and does not inspect the returned update error. It then inserts a `stock_movements` row and reports success if that insert succeeds. The two writes are not atomic in the observed client path. This can produce a movement record without the stock quantity changing, or leave quantity changed if movement logging fails.

### 6. Inventory — movement can produce invalid negative stock in the client path — P1 / PARTIAL

For outbound movement types, the page calculates `newQuantity = selectedItem.quantity - movement.quantity` without a visible non-negative guard. Whether the database rejects negative stock is not established by the page, so the UI should not assume a valid inventory balance without a certified server-side constraint/transaction.

### 7. Inventory — stock value is a stored-cost aggregate, not a reconciled valuation — P1 / PARTIAL

Stock Value is `quantity × cost_price` across the loaded inventory. The page does not show valuation date, currency/source freshness, costing method or reconciliation state. The figure is therefore an inventory-cost estimate, not necessarily a current accounting valuation.

## Required closure checks

1. Make request/order read failures visible and preserve an explicit empty-vs-error distinction.
2. Define and label order metrics by reporting period/scope.
3. Correct demand-chain copy to match the actual transition model.
4. Move inventory quantity + movement logging into one authoritative transaction/RPC with rollback semantics.
5. Enforce non-negative stock (or explicitly support backorders/negative inventory) at the server boundary.
6. Label inventory valuation methodology and freshness.
