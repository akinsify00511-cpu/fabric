# AVENIZE AI GOVERNANCE

**Version:** 1.0 (2026-08-24). Applies to every AI touchpoint: ask-avenize copilot,
parse-intent capture, capture-process (OCR/Whisper), transcribe-audio extraction,
deterministic intelligence engines.

## 1. Grounding

AI answers only from assembled context: the ask-avenize edge fn assembles REAL data
(current_business_health, current_metrics, open_recommendations, business_brain,
overdue counts) using the CALLER'S JWT — never a service-role aggregate. The
deterministic router (`copilotRouter.ts`) answers from governed data whenever the
intent maps; the LLM is a fallback that never answers blind.

## 2. Provenance & confidence

- Every derived statement is labeled: FACT / INFERENCE / ESTIMATE / RECOMMENDATION
  (Evidence.tsx ClaimTag; governed metric confidence: high/medium/low/insufficient).
- Capture pipeline distinguishes USER ENTERED / SYSTEM CAPTURED / AI INFERRED /
  USER CONFIRMED. AI-inferred data requires user confirmation before becoming a
  business record (receipt confirm, capture confirm).
- Diagnoses: symptom = FACT (it happened), cause = INFERENCE (declared causal rules
  in `diagnosis_rules`, tunable — never LLM-invented causality).

## 3. Hallucination handling

- The extraction contract everywhere: "If you cannot identify the field, use null.
  Do not fabricate." Garbage input yields nulls, not plausible text.
- Insufficient data → honest no-data answer + the action that creates the data.
- Value ledger counts only recorded real outcomes (status=outcome_recorded).

## 4. Prompt-injection defense

User input is fenced inside `<question>...</question>`, marked untrusted, with an
explicit refusal rule for role-change/instruction-override attempts. See threat
model §11.

## 5. Tool permissions & authorization

AI never bypasses authorization: edge functions verify the caller JWT + business
membership BEFORE any service-role use. AI-triggered actions flow through the same
RPCs (with the same guards) as human actions.

## 6. AI actions & human approval

- High-impact actions are recommendations (claims) until a human accepts/acts;
  `linked_action_id` binds the accepted recommendation to the real task.
- AI never silently executes irreversible financial or authorization changes.

## 7. AI memory & tenant isolation

- `copilot_messages` are business-scoped (RLS). ai_activity logs metadata only —
  prompt/response contents are never stored in the platform activity bus.
- Cross-business AI aggregates are anonymized counts/rates only (sector benchmarks),
  small-sample suppressed.

## 8. Auditability

- Claims lifecycle is the audit trail (expected vs actual impact).
- ai.completed/ai.failed events (with duration) feed the Riverways AI tab.

## 9. Cost control

- Daily per-business copilot cap (100 user messages), enforced server-side.
- OCR runs client-side (tesseract.js) — zero per-call cost; Whisper/GPT extraction
  only on explicit user capture actions.

## 10. Model fallback

Order: deterministic router → optional LLM (OPENAI_API_KEY or ANTHROPIC_API_KEY) →
honest deterministic fallback. The copilot works with NO LLM key; the provider badge
tells the user which answered ("Answered from your live data" vs "AI reasoning").

## 11. Model evaluation

`recommendation_effectiveness` closes the loop (issued/accepted/acted/outcome/
success-rate per rule). Golden datasets (7 profiles) assert deterministic engine
outputs on realistic fixtures (supabase/tests/golden_dataset_validation.sql).
