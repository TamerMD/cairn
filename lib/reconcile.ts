// ── Reconciliation ────────────────────────────────────────────────────────────
// Pure function, NO network. Given the pre-visit plan and a structured read of
// what the transcript addressed (produced live by Opus at runtime, or fed as a
// fixture in the test), classify every item:
//   addressed — planned and covered in the visit
//   gap       — planned (assess/discuss) but the transcript never addressed it
//   staged    — an order/referral queued for clinician sign-off
//   new       — surfaced in the visit but not in the plan
// Keeping this deterministic is what makes "done" model-verifiable while the
// runtime extraction stays genuinely live.

import type {
  AddressedExtraction,
  ReconciledAction,
  VisitPlan,
} from "@/lib/types";

export function reconcile(
  plan: VisitPlan,
  extraction: AddressedExtraction,
): ReconciledAction[] {
  const addressed = new Set(extraction.addressedPlanItemIds ?? []);
  const evidenceByItem = extraction.evidenceByItem ?? {};
  const actions: ReconciledAction[] = [];

  for (const item of plan.items) {
    const base = {
      content: item.content,
      kind: item.kind,
      planItemId: item.id,
      rationale: item.rationale,
      sourceRef: item.sourceRef,
      decisionRef: item.decisionRef,
    };

    if (addressed.has(item.id)) {
      actions.push({
        id: `act-${item.id}`,
        status: "addressed",
        ...base,
        evidence: {
          unitId: item.unitId,
          transcriptSpanId: evidenceByItem[item.id],
          triggeringFacts: item.triggeringFacts,
        },
      });
    } else if (item.kind === "order" || item.kind === "refer") {
      // Actionable items queue for sign-off rather than being "missed".
      actions.push({
        id: `act-${item.id}`,
        status: "staged",
        ...base,
        evidence: { unitId: item.unitId, triggeringFacts: item.triggeringFacts },
      });
    } else {
      // A planned assess/discuss step the conversation never touched — the gap.
      actions.push({
        id: `act-${item.id}`,
        status: "gap",
        ...base,
        evidence: { unitId: item.unitId, triggeringFacts: item.triggeringFacts },
      });
    }
  }

  (extraction.newItems ?? []).forEach((n, i) => {
    actions.push({
      id: `act-new-${i}`,
      status: "new",
      content: n.content,
      rationale: n.rationale,
      evidence: { transcriptSpanId: n.evidenceSpanId },
    });
  });

  return actions;
}

/** Convenience: counts per status (drives the small adherence/summary chips). */
export function reconciliationSummary(
  actions: ReconciledAction[],
): Record<string, number> {
  return actions.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
}
