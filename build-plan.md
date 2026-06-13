# 1-Day Build Plan

**Target:** a hosted Vercel URL demonstrating the full loop **live** by ~4:00 PM, with buffer for the video and submission.

## What's real vs. deliberately out of scope
- **Real and live:** source/PDF ingestion, the authoring agent (synthesize → interview → compile), the match engine, encounter composition, change propagation.
- **Out of scope (scoping choices, not fakes):** EHR integration / write-back, "sign", auth.
- **Synthetic by design:** patient data (no real PHI).
- **Fixtures:** stage-demo network parachute only; the hosted app runs live.

## Stack
- **Next.js** (App Router) + **TypeScript**, deployed to **Vercel** (public repo).
- **Tailwind** for fast, clean UI.
- Protocol/patient state in an **in-memory store + JSON seed** (no database).
- **Opus 4.8** (`claude-opus-4-8`) via the Anthropic API, **server-side only**; native PDF document blocks for ingestion.
- **vitest** for the verification loop.

## Phased plan — deterministic spine first, then make authoring real on top
**Phase 0 — scaffold + deploy (30 min).** Next.js + Tailwind + env. Deploy hello-world to Vercel *now* to prove the pipeline.

**Phase 1 — data model + match engine + composition (90 min).** Types (`ProtocolUnit` / `Decision` / `Patient` / `Encounter`). Deterministic match engine + encounter composition over a *seeded* PCOS protocol + 2–3 synthetic patients. *Point-of-care works even before authoring is wired — real logic, real data.*

**Phase 2 — the encounter experience (110 min — second centerpiece).** (a) *Pre-visit plan*: compose a `VisitPlan` from matched units + patient history, each item with rationale + provenance. (b) *Transcript*: seed a synthetic encounter transcript. (c) *Note + reconciled actions*: Opus generates a note structured to the scaffold (citing transcript spans) and reconciles plan vs. transcript → `addressed` / `gap` / `new` / `staged` actions, **with at least one caught gap**. Accept/override controls; mock sign. Build the deterministic plan composition first; layer note-gen + reconciliation on top.

**Phase 3 — the authoring agent, for real (120 min — the centerpiece).** Upload real source(s) (PDF/paper) → server route, Opus reads natively → drafts candidate units and flags decision forks → multi-turn interview UI walks the clinical leader through a **bounded, curated** fork set (cite sources per question) → compile to structured units with **dual provenance** → feeds the match engine. Pre-validate the PCOS fork set so the interview is crisp.

**Phase 4 — propagation + polish (45 min).** Edit a decision → version bump → re-compose (the wow). Wire the small adherence log.

**Phase 5 — harden + deploy + verify (60 min).** Run the verification test, fix, redeploy, smoke-test the live URL, write the README.

**Buffer (45 min).** Record the 1-min video; capture a stage-fallback screen recording of the live flow; finalize submission; confirm repo public.

## Scope cuts if behind (narrow breadth, keep realness)
1. Simplify note generation first (fewer sections / shorter note) — keep the reconciliation.
2. One source document instead of several.
3. Fewer decision forks in the interview (3 instead of ~6).
4. Collapse the worklist to a single patient.

**Never cut:** real source ingestion + the authoring interview; the pre-visit plan with provenance; the transcript→reconciliation with at least one caught gap; and the live edit-and-propagate moment.
