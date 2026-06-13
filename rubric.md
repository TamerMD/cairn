# rubric.md — Verifiable Success Criteria

Grade each item **PASS / FAIL**. Self-grade before declaring done; `npm test` should cover the automatable ones.

## Must pass — core demo
1. **Live URL** — deployed Vercel URL returns 200.
2. **Pre-visit plan** — opening a seeded patient renders a `VisitPlan` with ≥3 items (assess/discuss/order/refer), each drawn from the protocol.
3. **Provenance** — every plan item, note section, and action shows its source protocol unit **and** the patient fact / transcript span that produced it.
4. **Transcript → note** — a seeded transcript produces a `GeneratedNote` structured to the protocol's note scaffold.
5. **Reconciliation + caught gap** — the plan is reconciled against the transcript into `addressed` / `gap` / `new` / `staged` actions, and at least one **gap** (a planned step the transcript didn't address) is surfaced.
6. **Clinician control** — each action can be accepted or overridden; nothing auto-commits; overrides are logged.
7. **Change propagation** — editing one protocol unit changes the regenerated plan/actions for a matching patient; the verification test asserts this automatically.

## Opus use (live)
8. **Real source ingestion** — the app ingests at least one real source document (PDF/paper) that Opus reads directly.
9. **Authoring interview** — Opus surfaces genuine decision forks from the sources and conducts a grounded, multi-turn interview; confirmed decisions compile into structured `ProtocolUnit[]` with **dual provenance** (source citation + org decision).
10. **Live, not fixture** — the hosted app performs ingestion, authoring, note generation, and reconciliation live; any fixture is a stage-only fallback.

## Orchestration
11. **Model-verifiable done** — `npm test` proves the loop (plan → transcript → reconcile w/ gap → mutate → re-compose) without a human; the README documents how to rerun the whole setup.

## Anti-trap checks
12. **Not chat-over-PDF** — an agentic decision + reconciliation workflow producing structured artifacts with deterministic triggering, not retrieval.
13. **Not medical advice** — framed as an org-authored, clinician-in-the-loop ops tool.
14. **Not a dashboard** — adherence is a secondary panel, not the primary surface.
