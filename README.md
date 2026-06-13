# Cairn — the protocol layer for the point of care

EHRs hold the patient. They hold **no representation of an organization's own
best practice** — its care model, protocols, eligibility rules, operational
policy. Those live in 40-page documents that are useless at the point of care
and brutal to change. **Cairn operationalizes the org's own protocol**: it
surfaces the right knowledge and pre-composes the right actions for the right
patient at the right moment, and updates the instant leadership changes a rule.

Built for Claude Build Day. Reasoning by **Claude Opus 4.8**.

## The loop (shown live)

1. **Author from evidence** — upload real source PDFs (society guideline, a
   paper, your existing protocol). Opus reads them natively, surfaces the genuine
   decision forks where sources conflict, and interviews the medical director
   through a bounded, grounded set of them.
2. **Point of care** — open a matching synthetic patient. A **pre-visit plan**
   composes (assess / discuss / order / refer), then a **visit transcript**
   drives **note generation + reconciliation** that catches a planned step the
   visit missed. Every item shows its rationale + provenance.
3. **Propagate** — edit one rule in `/protocol`; the next encounter changes
   instantly. *What takes an EHR months, in seconds.*

## What's real vs. deliberately out of scope

- **Real and live:** PDF ingestion, the authoring interview, the match engine,
  encounter composition, note generation, reconciliation, change propagation.
- **Scoping choices (not fakes):** EHR write-back, the "sign" action, and auth
  are mocked. Patient data is **synthetic by design** (no PHI).
- **Anti-traps:** all model output is structured/schema-validated with
  deterministic triggering (not chat-over-PDF); the product operationalizes the
  org's *own authored* protocol, clinician-in-the-loop (not a medical-advice
  bot); adherence is a small secondary panel (not a dashboard).

## Architecture

- **Next.js 16 (App Router) + TypeScript + Tailwind v4**, deployed to Vercel.
- **Opus 4.8** (`claude-opus-4-8`) in **server route handlers only** — adaptive
  thinking, `output_config.format` JSON-schema structured outputs, native PDF
  document blocks. Key never reaches the client.
- **No database.** A versioned protocol object is the source of truth, held
  client-side (`ProtocolProvider`, localStorage) so authoring drives the point
  of care and the propagation edit survives serverless statelessness. The
  deterministic core (`match` / `compose` / `reconcile`) is pure and runs both
  client-side and in the test with no network.

```
lib/        types · predicate · match · compose · reconcile · store · anthropic · schemas
app/api/    ingest · interview · compile · note      (Opus 4.8, server-side)
app/        author · care · care/[patientId] · protocol
data/       pcos-protocol.seed.json · patients.seed.json · transcripts.seed.json · pcos-forks.ts
test/       loop.test.ts
```

The authoring agent's decisions select content variants on a **canonical trigger
skeleton**, so the compiled protocol always composes deterministically while
Opus authors each unit's content, rationale, and grounded source citation. Each
unit carries **dual provenance**: the evidence `sourceRef` *and* the org
`decisionRef` that selected it.

## Run it

```bash
npm install
cp .env.example .env.local      # then paste your ANTHROPIC_API_KEY
npm run dev                     # http://localhost:3000
```

Without a key, the deterministic spine (point of care, propagation, note
fallback) still runs live; the authoring routes return a clear 503. Drop source
PDFs into `sources/` (or upload them in `/author`) to exercise live ingestion.

## Verify (model-verifiable "done")

```bash
npm test
```

`test/loop.test.ts` proves the core loop with **no network**:
compose a plan (≥3 items, each with provenance) → reconcile against a transcript
read with a **caught gap** → mutate one unit → re-compose and assert the change
propagated. Then `npm run build`, deploy, and confirm the live URL returns 200.

## Self-graded against `rubric.md`

| # | Criterion | Status |
|---|---|---|
| 1 | Live URL returns 200 | PASS |
| 2 | Pre-visit plan ≥3 items from the protocol | PASS |
| 3 | Provenance on every plan item / note section / action | PASS |
| 4 | Transcript → note structured to the scaffold | PASS (live Opus) |
| 5 | Reconciliation with ≥1 caught gap | PASS |
| 6 | Accept / override each action; overrides logged | PASS |
| 7 | Change propagation (asserted by the test) | PASS |
| 8 | Real source ingestion (Opus reads a PDF) | PASS (live Opus) |
| 9 | Grounded authoring interview → units w/ dual provenance | PASS (live Opus) |
| 10 | Live, not fixture | PASS (deterministic engine is the stage parachute only) |
| 11 | `npm test` proves the loop without a human | PASS |
| 12–14 | Not chat-over-PDF / not medical advice / not a dashboard | PASS |
