// ── Deterministic transcript read (fallback engine) ──────────────────────────
// A keyword-based stand-in for the live Opus post-capture read. It is the
// stage-parachute fallback (per the brief: a recorded/offline path for when a
// live API call can't be made) and keeps the 3-phase encounter working end to
// end before the authoring/Opus layer is wired. Phase 3 upgrades /api/note to
// call Opus and falls back to this if the key is missing or a call fails.
//
// Reconciliation semantics: only assess/discuss items are marked "addressed"
// here; orders/referrals are left to stage for sign-off (reconcile handles the
// bucketing). The mental-health screen therefore correctly surfaces as a gap
// when a transcript doesn't mention it.

import type {
  AddressedExtraction,
  GeneratedNote,
  Transcript,
  VisitPlan,
} from "@/lib/types";

/** Per-unit keyword hints; falls back to salient tokens from the unit content. */
const KEYWORDS: Record<string, string[]> = {
  "u-bmi": ["bmi", "weight"],
  "u-bp": ["blood pressure", "bp", "over 82", "118 over"],
  "u-fg": ["hirsutism", "hair", "ferriman"],
  "u-cycle": ["cycle", "period", "menstru"],
  "u-mood": ["mood", "depression", "anxiety", "phq", "gad", "wellbeing"],
  "u-lifestyle": ["lifestyle", "diet", "weight-management", "weight management"],
  "u-metformin": ["metformin"],
  "u-cocp": ["contraceptive", "combined oral", "cocp", "the pill"],
};

const STOP = new Set([
  "record", "order", "discuss", "review", "screen", "measure", "document",
  "score", "offer", "consider", "the", "for", "and", "with", "of", "to", "as",
  "in", "a", "an", "first-line", "schedule",
]);

function tokensFor(unitId: string, content: string): string[] {
  if (KEYWORDS[unitId]) return KEYWORDS[unitId];
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function transcriptText(transcript: Transcript): string {
  return transcript.turns.map((t) => t.text.toLowerCase()).join(" ¶ ");
}

function findSpan(transcript: Transcript, tokens: string[]): string | undefined {
  for (const turn of transcript.turns) {
    const lc = turn.text.toLowerCase();
    if (tokens.some((tok) => lc.includes(tok))) return turn.spanId;
  }
  return undefined;
}

export function localExtraction(
  plan: VisitPlan,
  transcript: Transcript,
): AddressedExtraction {
  const text = transcriptText(transcript);
  const addressedPlanItemIds: string[] = [];
  const evidenceByItem: Record<string, string> = {};

  for (const item of plan.items) {
    if (item.kind === "order" || item.kind === "refer") continue; // these stage
    const tokens = tokensFor(item.unitId, item.content);
    if (tokens.some((tok) => text.includes(tok))) {
      addressedPlanItemIds.push(item.id);
      const span = findSpan(transcript, tokens);
      if (span) evidenceByItem[item.id] = span;
    }
  }

  // Lightweight new-item detection: a flagged symptom not in the plan.
  const newItems: AddressedExtraction["newItems"] = [];
  if (text.includes("acne") && !plan.items.some((i) => i.content.toLowerCase().includes("acne"))) {
    newItems.push({
      content: "Evaluate worsening acne; consider topical / anti-androgen therapy",
      evidenceSpanId: findSpan(transcript, ["acne"]),
      rationale: "Raised by the patient during the visit; not in the pre-visit plan.",
    });
  }

  return { addressedPlanItemIds, evidenceByItem, newItems };
}

/** Naive note: maps each scaffold section to the most relevant transcript turns. */
export function localNote(
  plan: VisitPlan,
  transcript: Transcript,
): GeneratedNote {
  const SECTION_HINTS: Record<string, string[]> = {
    "Diagnosis & Rotterdam criteria": ["pcos", "cycle", "hirsutism", "irregular"],
    "Metabolic risk": ["bmi", "weight", "blood pressure", "glucose", "lipid"],
    "Reproductive goals & plan": ["pregnan", "fertility", "letrozole", "contracept", "cycle"],
    "Psychological screening": ["mood", "depression", "anxiety"],
  };

  return {
    sections: plan.noteScaffold.map((sec) => {
      const hints = SECTION_HINTS[sec.key] ?? sec.key.toLowerCase().split(/\s+/);
      const hits = transcript.turns.filter((t) =>
        hints.some((h) => t.text.toLowerCase().includes(h)),
      );
      const content = hits.length
        ? hits.map((t) => t.text).join(" ")
        : "Not addressed in this visit.";
      return {
        key: sec.key,
        content,
        citations: hits.map((t) => ({ transcriptSpanId: t.spanId })),
      };
    }),
  };
}
