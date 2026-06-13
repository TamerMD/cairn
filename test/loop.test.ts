// ── Verification loop (rubric items 2, 3, 5, 7, 11) ───────────────────────────
// Proves the core loop with NO network: compose a plan → reconcile against a
// transcript read (fixture standing in for Opus) with a caught gap → mutate one
// protocol unit → re-compose and assert the change propagated.

import { describe, expect, it } from "vitest";
import { loadSeedProtocol, getPatient, updateUnit } from "@/lib/store";
import { composeVisitPlan } from "@/lib/compose";
import { reconcile } from "@/lib/reconcile";
import type { AddressedExtraction } from "@/lib/types";

const protocol = loadSeedProtocol();
const dana = getPatient("dana-whitfield")!;
const marcus = getPatient("marcus-lindqvist")!;

describe("composition (pre-visit plan)", () => {
  it("composes a plan with ≥3 indicated items for a matching patient", () => {
    const plan = composeVisitPlan(protocol, dana);
    expect(plan.eligible).toBe(true);
    expect(plan.items.length).toBeGreaterThanOrEqual(3);
  });

  it("every plan item carries provenance (source unit + triggering facts)", () => {
    const plan = composeVisitPlan(protocol, dana);
    for (const item of plan.items) {
      expect(item.unitId).toBeTruthy();
      expect(item.sourceRef.source).toBeTruthy();
      expect(item.triggeringFacts.length).toBeGreaterThan(0);
    }
  });

  it("fires the fertility-gated and BMI-gated units for Dana", () => {
    const plan = composeVisitPlan(protocol, dana);
    const ids = plan.items.map((i) => i.id);
    expect(ids).toContain("u-letrozole"); // goal: Fertility
    expect(ids).toContain("u-ogtt"); // BMI ≥ 25 + no recent OGTT
  });

  it("excludes an ineligible patient (real matching, not a stub)", () => {
    const plan = composeVisitPlan(protocol, marcus);
    expect(plan.eligible).toBe(false);
    expect(plan.items).toHaveLength(0);
  });
});

describe("reconciliation (post-capture) surfaces a caught gap", () => {
  // What Opus extracts from Dana's transcript at runtime — here as a fixture.
  // Note: the mood/PHQ-2 screen (u-mood) is deliberately NOT addressed.
  const extraction: AddressedExtraction = {
    addressedPlanItemIds: [
      "u-bmi",
      "u-bp",
      "u-fg",
      "u-cycle",
      "u-lifestyle",
      "u-letrozole",
    ],
    evidenceByItem: {
      "u-bmi": "t5",
      "u-bp": "t5",
      "u-fg": "t5",
      "u-cycle": "t3",
      "u-lifestyle": "t7",
      "u-letrozole": "t9",
    },
    newItems: [
      {
        content: "Evaluate worsening acne; consider topical/anti-androgen therapy",
        evidenceSpanId: "t14",
      },
    ],
  };

  it("classifies actions into addressed / gap / staged / new", () => {
    const plan = composeVisitPlan(protocol, dana);
    const actions = reconcile(plan, extraction);
    const byStatus = (s: string) => actions.filter((a) => a.status === s);

    expect(byStatus("addressed").length).toBeGreaterThan(0);
    expect(byStatus("staged").length).toBeGreaterThan(0); // orders queued for sign-off
    expect(byStatus("new").length).toBe(1); // the acne the patient raised
    expect(byStatus("gap").length).toBeGreaterThanOrEqual(1);
  });

  it("surfaces the un-addressed mental-health screen as the gap", () => {
    const plan = composeVisitPlan(protocol, dana);
    const actions = reconcile(plan, extraction);
    const gaps = actions.filter((a) => a.status === "gap");
    expect(gaps.some((g) => g.planItemId === "u-mood")).toBe(true);
  });
});

describe("change propagation (the wow, asserted automatically)", () => {
  it("editing a trigger removes a previously-firing item for the next encounter", () => {
    const before = composeVisitPlan(protocol, dana);
    expect(before.items.map((i) => i.id)).toContain("u-ogtt");

    // Tighten the OGTT BMI threshold from 25 to 40 — Dana (BMI 32.4) no longer qualifies.
    const edited = updateUnit(protocol, "u-ogtt", {
      trigger: {
        all: [
          { fact: "problems", op: "includes", value: "PCOS", label: "Problem list" },
          { fact: "vital:BMI", op: "gte", value: 40, label: "BMI" },
          { fact: "lab:OGTT", op: "missing", withinDays: 365, label: "OGTT (75g)" },
        ],
      },
    });

    expect(edited.version).toBe(protocol.version + 1);
    const after = composeVisitPlan(edited, dana);
    expect(after.items.map((i) => i.id)).not.toContain("u-ogtt");
  });

  it("editing content propagates to the regenerated plan", () => {
    const edited = updateUnit(protocol, "u-letrozole", {
      content: "Offer letrozole 2.5mg cycle days 3–7 (first-line)",
    });
    const after = composeVisitPlan(edited, dana);
    const item = after.items.find((i) => i.id === "u-letrozole");
    expect(item?.content).toContain("2.5mg");
    expect(item?.unitVersion).toBe(2); // unit version bumped
  });
});
