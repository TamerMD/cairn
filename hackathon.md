# Hackathon Context & Demo Plan

## Event
Claude Build Day (Shack15, SF). Build a standalone app from a standing start, deploy to a live URL, submit repo + brief + rubric + a 1-minute demo video by **5:00 PM**. Top 6 teams present live (3 min + 1–2 min Q&A).

## Hard rules that constrain us
- Repo must be **public**.
- The demo must highlight **only what we built today**; original work must be clearly identifiable.
- Must be a **standalone product in its own public repo** — do **not** pull in Attend's proprietary code. Build this PoC fresh and self-contained.

## Scoring (round 1 weighting)
- **Impact 35%** — real-world potential; who benefits and how much.
- **Demo 35%** — working, impressive, holds up live, proves the impact.
- **Opus 4.8 use 15%** — creative, beyond a basic integration.
- **Orchestration 15%** — judged from brief/rubric/workflow: is "done" model-verifiable (tests, responding URL, rubric file)? Could another team rerun the setup tomorrow?

## Prohibited buckets — actively dodge all three
- **Basic RAG** → we use *structured protocol units + deterministic triggering*, not chat-over-PDF. Lean into the structure.
- **Medical advice bot** → frame as operationalizing the *org's own authored* protocol, clinician-in-the-loop, a B2B clinical-ops tool. The AI applies the customer's codified care model; it does not dispense medical advice.
- **Dashboard as the main feature** → the adherence view stays a small secondary panel.

## How we map to the rubric
- **Impact:** real founder, real customers (Elation/Athena outpatient shops), a sharp thesis — EHRs lack the local-best-practice layer.
- **Demo:** the author → point-of-care → live-edit-propagation loop.
- **Opus:** live protocol decomposition (document → structured units) + patient-state extraction from a messy note.
- **Orchestration:** `brief.md` + `rubric.md` + a self-verifying test that proves change-propagation without a human.

## 3-minute demo script
1. **(0:20) Problem + who.** Orgs cram best practice into giant docs; EHRs don't operationalize them; changing them is brutal for frontline clinicians.
2. **(0:55) Authoring agent (showpiece).** Upload a real PCOS guideline PDF + a paper → Opus reads them, drafts, and interviews the medical director through the real forks (include AMH in diagnosis? letrozole vs. clomiphene first-line? follow-up cadence? who runs follow-up?) → confirmed decisions compile into structured units with dual provenance.
3. **(1:05) The encounter.** Open a synthetic patient → history + guideline compose a pre-visit action plan (with provenance) → paste the visit transcript → Opus generates the note to the protocol's scaffold *and* reconciles plan vs. transcript, **catching a planned step that wasn't addressed** → clinician accepts/overrides, signs (mock). *(Timings approximate — trim to fit 3:00.)*
4. **(0:40) The wow.** Edit one rule in authoring → reopen the next patient → the encounter has changed instantly. "What takes an EHR months, done in seconds."
5. **(0:20) Close.** This is the layer EHRs don't have — your org's care model, operationalized. Flash the tiny adherence indicator and the self-grading test (the orchestration story).

## Demo safety (stage only)
The hosted app runs fully live for the judges. For the round-2 *stage* demo only, keep a recorded screen capture of the full live flow as a parachute against a network blip — a dropped API call can't be recovered in three minutes on stage. Default to running it live.
