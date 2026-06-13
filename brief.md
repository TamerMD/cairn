# Cairn — Product Brief
*(working codename: the protocol layer for the point of care — rename freely)*

## The insight
EHRs hold patient context but have **no representation of an organization's local best practice** — its care model, protocols, eligibility rules, and operational policies. Today those live in giant documents that are useless at the point of care and brutal to change. Cairn is the layer that **operationalizes an organization's own protocols**: it surfaces the right knowledge and pre-composes the right actions for the right patient at the right moment, and updates instantly when leadership changes a protocol.

## Who it's for
- **Author / buyer:** clinical leadership (medical director, clinical ops) at specialty or multidisciplinary outpatient groups who have invested in their *own* way of delivering care for a condition or service line.
- **User:** the frontline clinician, who should never have to remember which detail changed in a 40-page protocol.
- **PoC focus:** a single specialty service line. Default seed = **PCOS** (swappable to Type 2 Diabetes).

## Differentiated value drivers
1. **Operationalizes the org's *own* care model** — not generic guidelines. This is precisely what the EHR's native CDS and ambient tools structurally don't do.
2. **Knowledge that finds the clinician** — context-triggered delivery, not a searchable repository.
3. **Instant change management** — atomic, versioned protocol units propagate to the point of care with no redeploy, no retraining, no re-reading the document.
4. **Advisory by design** — every surfaced item shows its protocol source and the patient fact that triggered it. The clinician decides and signs. Provider judgment governs.

## The proof we work backwards from (the demo)
One loop, shown live:
**author a protocol from real sources via the agent interview → a matching patient → a pre-composed encounter** (capture fields, staged orders/referrals, note scaffold, each with rationale + provenance) → **edit one protocol rule and watch the next encounter change instantly.**

If a judge sees that loop and feels the "an EHR takes *months* to do this" contrast, the thesis is proven.

## Product surfaces (targeted)
1. **Authoring agent** (clinical leadership): ingest *diverse real sources* (society guideline PDFs, research papers, the org's existing doc) → Opus synthesizes them and surfaces the genuine decision forks where sources conflict or leave latitude → an interactive, grounded interview walks the clinical leader through those forks → confirmed decisions compile into structured, condition-bound units with **dual provenance** (the evidence cited *and* the org decision that selected it), versioned. The literature is the menu; their best practice is the choices made from it.
2. **Encounter experience** (clinician), in three phases: **(a) Pre-visit** — patient history + matched guideline units compile a clear *visit action plan* (assess / discuss / order / refer), each with rationale + provenance. **(b) In-visit** — an encounter transcript stands in for the conversation. **(c) Post-capture** — the transcript drives note generation (structured to the protocol's note scaffold) *and* a reconciliation of the plan against what actually happened: planned-and-addressed items close, planned-but-missed items surface as **gaps**, unplanned items become new actions, and indicated orders/follow-ups stage for sign-off. Accept/override each; sign mocked.
3. **Change & governance** (woven through both): edit a unit → version bump → immediate effect on the next matching encounter; plus a small adherence indicator (surfaced vs. acted). Secondary — not a dashboard.

## What's real vs. out of scope today
**Real and live** (judges use the hosted app): source ingestion, the authoring agent, matching, composition, propagation.
**Out of scope** — scoping choices, not fakes: EHR integration / write-back, "sign", auth, multi-role workflows, goal-state/journey inference, e-prescribing. Patient data is synthetic by design (no PHI). The only fixture is a stage-demo network parachute; the hosted app runs fully live.
