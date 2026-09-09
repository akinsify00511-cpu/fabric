# Avenize Rendering Integrity Audit — Layer 4

**Date:** 2026-09-09  
**Branch:** `audit/feature-operational-audit-2026-09-09`  
**Scope:** Finance Center, payment settings and remaining configuration/financial surfaces.  
**Mode:** Audit only. No product repairs performed.

## Confirmed findings

### 1. Finance Center — child data loaders ignore business context changes — P0 / FAIL

`OverviewTab`, `BankingTab` and `VATTab` call their loaders from `useEffect(..., [])` even though `businessId` is supplied asynchronously from `staff?.business_id`. If the component mounts before the business context is available, the loader can execute with `undefined` and never rerun for the actual business. This is the same async-context correctness class already found in Sales Performance.

### 2. Finance Center — overview query failures can render zeros — P1 / FAIL

The overview uses `Promise.all` but does not inspect individual Supabase `error` values. It reduces `data` with `|| 0`, so a failed debtors/creditors/VAT/bank query can become a zero-valued financial card rather than an error/unknown state.

### 3. Finance Center — banking query failure can render “No bank accounts added” — P1 / FAIL

Bank account loading ignores the returned query error and sets `accounts` to `data || []`. A database failure can therefore be presented as a genuinely empty bank-account state.

### 4. Finance Center — VAT query failure can render an empty tax ledger — P1 / FAIL

VAT loading similarly ignores query errors and renders the empty-record state. The user cannot distinguish “no VAT records” from “VAT data unavailable.”

### 5. Finance Center — WHT/debtors/creditors surfaces require the same error-state audit — P1 / NOT CERTIFIED

The Finance Center establishes a repeated implementation pattern of direct Supabase reads with empty fallbacks. The remaining tax/receivable/payable tabs must be treated as untrusted until their query error, period, currency and authoritative-source semantics are independently verified.

### 6. Payment Settings — UI contradicts current payment capability — P0 / FAIL

`PaymentSettings.tsx` states **“No external payment providers in this deployment: payments are recorded manually”**, while the production codebase contains Paystack payment initialization/verification paths and the product has an online checkout journey. This creates a materially misleading capability statement and can cause operators to treat gateway transactions as impossible/manual-only.

### 7. Payment Settings — payment ledger is capped at 50 with no truncation disclosure — P1 / PARTIAL

The page loads only 50 payment records and derives Total Received/Successful/Pending/Failed from that bounded collection. The cards therefore do not represent a true total for a business with more than 50 payments, yet the labels imply complete totals.

### 8. Payment Settings — ledger query failure can render “No payments yet” — P1 / FAIL

The payment query catches/logs errors but does not set an error state. `payments=[]` then renders **“No payments yet”**, conflating unavailable ledger data with an empty ledger.

### 9. Payment Settings — provider/method semantics are ambiguous — P1 / PARTIAL

Paystack and Flutterwave records are displayed as **“online”** based solely on provider string, while the page's explanatory copy says payments are manually recorded by the team. The UI lacks a clear distinction among manually recorded, gateway-verified, pending, failed and externally settled transactions.

### 10. Finance Center — “Bank Balance” is rendered as a direct sum of entered balances without reconciliation evidence — P1 / PARTIAL

The overview sums `bank_accounts.balance` and labels the result **Bank Balance**. The inspected path does not show bank-feed synchronization, reconciliation date, or source freshness. This can be interpreted as a live bank balance when it may be manually entered/stored state.

## Required closure checks

1. Make every Finance Center loader react to the actual business context and certify the child-tab lifecycle.
2. Add explicit query-error states to all financial surfaces.
3. Replace bounded payment “totals” with authoritative aggregates or disclose truncation/pagination.
4. Align payment capability copy with the actual deployed gateway architecture.
5. Separate manual ledger entries from gateway-verified money movement and expose provenance.
6. Establish freshness/reconciliation metadata for bank balances.
