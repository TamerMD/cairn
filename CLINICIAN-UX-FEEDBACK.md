# Cairn — Point-of-Care UX Review

*Walkthrough of the live app (`/care`) from the seat of a frontline clinician. Focus: making the point-of-care flow faster to read and act on. Code untouched.*

## What I walked through

Worklist → **Dana Whitfield** (12 indicated items) → Pre-visit plan → In-visit transcript → Capture & reconcile → Post-capture (live read). Also checked **Marcus Lindqvist**, the eligibility control (correctly gated out: "does not meet PCOS service-line criteria", empty scaffold).

## The thesis lands

Before the critique — the core loop is genuinely compelling and clinically legible. The reconciliation screen (2 gaps, 1 new, 10 addressed) is the moment a clinician feels it: it caught that psych screening was planned-but-missed, caught the acne flare the patient raised off-plan, and cited the exact transcript turn (t5, t11, t14) behind each note line. The Assess / Discuss / Order / Refer grouping maps to how clinicians actually think about a visit. The eligibility gate, the dual provenance (guideline quote *plus* org decision), and the live note generation all read as real. Keep all of that.

The problem is not the substance. It's that the substance is buried in a layout built for reading, not for working.

---

## The core friction: it reads like a journal article, not a clinical tool

A frontline clinician engages this between rooms, often with the patient in front of them. They scan, they don't read. Right now every screen optimizes for the opposite:

**Each item is a tall, fully-expanded card.** Title + one-line rationale + trigger chips + a full italic guideline quote + (often) an ORG DECISION line. That's five layers of text per item, times 12–13 items. On a laptop you see about two cards at once. The pre-visit plan and the post-capture screen each take many scrolls to traverse. A clinician walking into the room cannot hold the plan in their head because they can never see it on one screen.

**The provenance is always at full volume.** The guideline citation is Cairn's differentiator, but a verbatim quote on every card, permanently expanded, turns the signal into wallpaper. By card four the clinician stops reading the quotes entirely — which defeats the purpose. Provenance should be one tap away, not always-on.

**The trigger chips repeat the same fact 12 times.** Nearly every item shows `TRIGGERED BY · Problem list: PCOS`. On a PCOS protocol, for a PCOS patient, that's true of everything and explains nothing. It's pure noise that pushes the *distinguishing* triggers (BMI ≥ 25, "no result on file", Goal: Fertility) into the visual clutter. Those distinguishing facts are the ones that actually answer "why this patient."

**The typography fights fast scanning.** Heavy use of all-caps, letter-spaced, low-contrast labels (CONTEXT SUMMARY, TRIGGERED BY, ORG DECISION) plus a serif display face is elegant editorial styling — but caps-tracking is measurably slower to read and the muted contrast makes status hard to triage at a glance. It looks like a magazine; it should feel like an instrument panel.

**It's monochrome, so nothing triages itself.** Everything is cream and green. A GAP is signalled only by a small dot. The four action types look identical. The eye has no color to sort by, so the clinician has to read every label to know what kind of thing they're looking at.

---

## Screen-specific notes

### Pre-visit plan
The content is right; the density is wrong. There's no single-glance summary of the plan's shape before you start scrolling — the counts exist per-section but you can't see "5 assess / 2 discuss / 4 order / 1 refer" as one scannable bar. The note scaffold sidebar is a nice touch and well-placed.

### In-visit
Cleanest screen. Transcript is readable, "Capture & reconcile" is a clear primary action. The right-rail explainer paragraph is wordier than it needs to be but it's harmless.

### Post-capture (the strongest *and* the most overloaded screen)
This is where the workflow cost is highest:

- **The 10 already-addressed items are rendered as full, tall, interactive cards** — each with rationale, citation, *and* the "HEARD AT T5…" transcript snippet, *and* an Accept/Override pair. But these are the items that need no decision. The clinician's attention should go to the 2 gaps + 1 new; instead those are buried at the top of a long scroll of things that already went fine.
- **Accept/Override appears on all 13 items → "0/13 ACTED."** That's 13 clicks to clear a visit, most of them rubber-stamps. That is the opposite of a fast workflow.
- **The same two verbs mean three different things.** On a *gap* ("planned but not addressed"), what does "Accept" do — accept that it's a gap? carry it forward? On a *new* item it means add-to-plan. On an *addressed* item it means confirm. One verb pair across three semantics makes the clinician stop and decode each time.
- **No state feedback.** Clicking Accept filled the button green, but the header counts ("2 GAP · 1 NEW · 10 ADDRESSED") and the "0/13 ACTED" tally didn't visibly move. The clinician can't tell what's left to do. ("STAGED" also appears in the summary with no example to explain it.)
- The generated note with inline transcript citations is excellent — leave it as is.

---

## Recommendations — ranked by impact on speed

**1. Spotlight the exceptions; collapse the routine.** On post-capture, lead with the gaps and new items as full cards. Collapse the 10 addressed into a compact one-line checklist (`✓ Blood pressure · heard at T5`), expandable on click. The clinician's eye should land immediately on the 2–3 things that need a decision.

**2. Make provenance progressive.** Default each item to title + one-line rationale + distinguishing trigger only. Put the guideline quote and ORG DECISION behind a "Why?" toggle. The promise ("every item shows its source") is kept — it's one tap away instead of shouting over the content.

**3. Match the action verbs to the situation.** Gap → `Order now / Defer / Not indicated`. New → `Add to plan / Dismiss`. Addressed → a single `Confirm` (or auto-confirmed, with override available). Add a **"Confirm all addressed"** bulk action so the routine clears in one click and the clinician only touches the exceptions.

**4. Kill the redundant trigger chips.** Drop the universal `Problem list: PCOS` chip. Show only the facts that distinguish this patient: `BMI 32.4`, `no result on file`, `Goal: Fertility`. That's the "why this patient" story, and it gets sharper by removing the constant.

**5. Add a one-glance plan bar.** At the top of the pre-visit plan, a compact, color-coded strip — `Assess 5 · Discuss 2 · Order 4 · Refer 1` — that doubles as jump links. The clinician sees the whole visit's shape before scrolling, and can jump to Orders directly.

**6. Color-code action type and status.** Give Assess / Discuss / Order / Refer four distinct accent colors and make GAP visually loud (warning tone, not a quiet dot). Let the eye triage by color instead of reading every label.

**7. Tighten typography for scanning.** Reduce all-caps letter-spaced labels to sentence-case bold or colored tags; raise contrast on secondary text; reserve the serif for the patient header. Increase card density so 4–5 items fit per screen instead of ~2.

**8. Live state + a guarded Sign.** Update the header counts and the acted-tally as items are confirmed. Keep "Sign encounter" visibly blocked (or warned) while unresolved gaps remain — e.g. "2 gaps unresolved" beside the button. That turns the gap count from a static stat into the thing driving the clinician to closure.

**9. Sticky header.** Pin the patient one-liner, phase nav, and counts on scroll so orientation survives a long list.

### If you only do three before the demo
Items **1, 2, and 3** — collapse addressed items, hide provenance behind a toggle, and fix the accept/override verbs + bulk-confirm. Those three turn the post-capture screen from "read all 13" into "decide the 3 that matter," which is the exact "an EHR takes months to do this" contrast you're working backwards from.
