# CLAUDE.md — Operating Instructions

You are building **Cairn**, a standalone proof-of-concept. Read `brief.md`, `hackathon.md`, `build-plan.md`, and `rubric.md` first. Work autonomously toward a hosted Vercel URL that demonstrates the loop **for real**.

## Philosophy: build it real
Judges open the hosted app live, and we're using Opus 4.8 — the intelligence should actually work, not be faked.
- **Real and live:** source/document understanding, the authoring agent, the match engine, encounter composition, change propagation.
- **Deliberately out of scope (scoping choices, not fakes):** EHR integration / write-back, the "sign" action, auth.
- **Synthetic data is correct:** patient data is synthetic because using real PHI would be wrong — not a shortcut.
- **Fixtures have exactly one job:** a recorded fallback for the round-2 *stage* demo, since a dropped API call in front of an audience can't be recovered in three minutes. The hosted app judges use in round one runs fully live.

## What "done" means
The loop works end to end against `rubric.md`, the verification test passes, and the live URL responds 200. Re-read `rubric.md` before declaring done and grade yourself PASS/FAIL on each item.

## The centerpiece: the authoring agent (real, live)
Not paste-to-JSON. An agentic flow that turns diverse evidence into *this org's* best practice. The literature is the menu; the org's best practice is the choices made from it.
1. **Ingest diverse real sources** — society guideline PDFs, research papers, an org's existing doc. Opus reads PDFs natively via API document content blocks (base64). Real ingestion, server-side.
2. **Synthesize + find the forks.** Opus drafts candidate protocol elements across sources and explicitly flags where sources conflict or leave a decision open.
3. **Interview, grounded.** A multi-turn agent walks the clinical leader through those decision points, each question citing what the sources actually said. **Bound the interview** to a curated, pre-validated set for the seed condition (~4–6 forks for PCOS) so it's reliably crisp, not open-endedly flaky.
4. **Compile with dual provenance.** Confirmed decisions + extracted content become structured `ProtocolUnit`s carrying *both* the source citation and the org decision that selected it.
5. Compiled units drive point-of-care composition; editing a decision re-compiles them (the propagation story).

Keep all model use as structured/agentic reasoning, never freeform chat — that's what keeps us out of the "basic RAG" bucket.

## Build order
**Build the deterministic spine (match engine + composition over a seeded protocol) before the authoring agent**, so there's always a working point-of-care demo; then make authoring real on top. Deploy a hello-world to Vercel in Phase 0 to de-risk the pipeline early. Follow `build-plan.md`.

## Tech decisions (don't re-litigate)
- Next.js App Router + TS + Tailwind; Vercel; vitest.
- **No database** — in-memory store + JSON seed (a versioned protocol object is enough).
- Opus 4.8 (`claude-opus-4-8`) via the Anthropic API in **server route handlers only**; never expose the key client-side. Use native PDF document blocks for source ingestion.
- Patient data: **structured synthetic seed** — put the Opus depth into authoring, not also into patient-note extraction.

## Data model (starting point — refine as needed)
- `ProtocolUnit`: `id`, `version`, `type` ('eligibility' | 'order' | 'captureField' | 'noteSection' | 'followUp'), `content`, `trigger` (structured predicate over patient facts), `rationale`, `sourceRef` (citation/provenance to source), `decisionRef` (the org decision that selected it), `status` ('draft' | 'approved').
- `Decision`: `id`, `question`, `optionsConsidered[]` (each with source citation), `chosen`, `version`.
- `WorkflowStep`: `id`, `role`, `sequence`, `unitRefs[]`, `doneCondition`.
- `Patient`: `id`, `demographics`, `problems[]`, `meds[]`, `labs[]`, `vitals[]`.
- `Encounter`: `patientId`, composed `{ contextSummary, captureFields[], orders[], noteScaffold }`; **every composed item carries `{ unitId, triggeringFacts[] }` for provenance.**
- `AdherenceEvent`: `encounterId`, `unitId`, `action` ('accepted' | 'overridden').

## Guardrails
- Commit frequently; keep the repo **public**.
- **Every surfaced encounter item MUST show its rationale + provenance** (protocol unit + patient fact). Core, not polish.
- Nothing auto-commits; the clinician accepts/overrides each item; log overrides.
- Real first; the fixture fallback is the stage parachute only (see Philosophy). Never fake the intelligence.
- Use available skills: read the `frontend-design` SKILL.md before building UI; `clinical-template-creator` and `em-mdm-coder` can inform protocol-unit / note-scaffold structure and coding logic.
- Don't build infrastructure you can fake (DB, auth) — but the document understanding, interview, matching, composition, and propagation are all real.

## Verification loop (run before declaring done)
`npm test`:
1. loads the authored/seeded PCOS protocol + a matching patient,
2. composes an encounter and asserts expected units fired (orders/fields present, each with provenance),
3. mutates one decision/unit,
4. re-composes and asserts the change propagated.
Then smoke-check the dev server (and deployed URL) returns 200. Fix and re-run until green.

## Protect the demo
**author from real sources → point-of-care composition → edit-a-decision-and-propagate.** If short on time, narrow breadth (one condition, one source, fewer forks, fewer patients) — never cut the real authoring interview, the composed encounter with provenance, or the live edit-and-propagate moment.
