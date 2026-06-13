// ── Offline compiler tests (NO network / NO Opus) ────────────────────────────
// Validates buildProtocolFromCompiled — the deterministic layer that turns
// Opus's compile output into a computable Protocol — using a FIXTURE that
// mimics a realistic (and deliberately messy) model response. This is how we
// verify compiler/validator/predicate changes without firing a live Opus call.

import { describe, expect, it } from "vitest";
import { buildProtocolFromCompiled, type CompiledProtocol } from "@/lib/schemas";
import { composeVisitPlan } from "@/lib/compose";
import { getPatient } from "@/lib/store";

// A realistic compile output, including the messy cases the compiler must handle:
//  - include gate + a cohort exclusion gate
//  - narrowly-gated orders (BMI≥25, lab missing, Fertility goal)
//  - a broad cohort captureField
//  - a noteSection with an EMPTY trigger (must NOT be dropped → cohort fallback)
//  - an order with an unparseable numeric condition (must be repaired/dropped, unit kept)
const FIXTURE: CompiledProtocol = {
  condition: "PCOS",
  units: [
    {
      id: "incl-pcos",
      type: "eligibility",
      gate: "include",
      planKind: "none",
      dimension: "inclusion",
      content: "PCOS, reproductive-age female",
      rationale: "Defines the cohort.",
      noteSectionKey: "",
      whenAll: [
        { fact: "problems", op: "includes", value: "PCOS", withinDays: 0, label: "Problem list" },
        { fact: "sex", op: "equals", value: "female", withinDays: 0, label: "Sex" },
        { fact: "age", op: "between", value: "18,45", withinDays: 0, label: "Age" },
      ],
      whenAny: [],
      sourceRef: { source: "2023 Guideline", locator: "Dx", quote: "Rotterdam criteria." },
      decisionRef: "",
    },
    {
      id: "excl-t2dm",
      type: "eligibility",
      gate: "exclude",
      planKind: "none",
      dimension: "exclusion",
      content: "Exclude if established Type 2 Diabetes (managed on a separate pathway)",
      rationale: "Off-pathway.",
      noteSectionKey: "",
      whenAll: [
        { fact: "problems", op: "includes", value: "Type 2 Diabetes", withinDays: 0, label: "Problem list" },
      ],
      whenAny: [],
      sourceRef: { source: "Org pathway", locator: "Excl", quote: "" },
      decisionRef: "",
    },
    {
      id: "order-ogtt",
      type: "order",
      gate: "none",
      planKind: "order",
      dimension: "workup",
      content: "Order 75g OGTT",
      rationale: "Glycaemic screen when overweight and none on file.",
      noteSectionKey: "",
      whenAll: [
        { fact: "problems", op: "includes", value: "PCOS", withinDays: 0, label: "Problem list" },
        { fact: "vital:BMI", op: "gte", value: "25", withinDays: 0, label: "BMI" },
        { fact: "lab:OGTT", op: "missing", value: "", withinDays: 365, label: "OGTT" },
      ],
      whenAny: [],
      sourceRef: { source: "2023 Guideline", locator: "Glyc", quote: "OGTT preferred at BMI≥25." },
      decisionRef: "",
    },
    {
      id: "order-letrozole",
      type: "order",
      gate: "none",
      planKind: "order",
      dimension: "preferredTherapy",
      content: "Offer letrozole first-line",
      rationale: "First-line ovulation induction for those seeking fertility.",
      noteSectionKey: "",
      whenAll: [
        { fact: "problems", op: "includes", value: "PCOS", withinDays: 0, label: "Problem list" },
        { fact: "goals", op: "includes", value: "Fertility", withinDays: 0, label: "Goal" },
      ],
      whenAny: [],
      sourceRef: { source: "Legro 2014", locator: "RCT", quote: "Higher live-birth rate." },
      decisionRef: "d-ovulation",
    },
    {
      id: "assess-mood",
      type: "captureField",
      gate: "none",
      planKind: "assess",
      dimension: "counseling",
      content: "Screen for depression & anxiety",
      rationale: "Mandated psychological screening for all PCOS patients.",
      noteSectionKey: "",
      whenAll: [
        { fact: "problems", op: "includes", value: "PCOS", withinDays: 0, label: "Problem list" },
      ],
      whenAny: [],
      sourceRef: { source: "2023 Guideline", locator: "Psych", quote: "Screen all." },
      decisionRef: "",
    },
    {
      // Unparseable numeric condition — the bad condition is dropped but the unit
      // must survive on its remaining valid condition.
      id: "order-broken",
      type: "order",
      gate: "none",
      planKind: "order",
      dimension: "workup",
      content: "Order fasting lipids",
      rationale: "Baseline cardiometabolic risk.",
      noteSectionKey: "",
      whenAll: [
        { fact: "problems", op: "includes", value: "PCOS", withinDays: 0, label: "Problem list" },
        { fact: "age", op: "gt", value: "not-a-number", withinDays: 0, label: "Age" },
      ],
      whenAny: [],
      sourceRef: { source: "2023 Guideline", locator: "CV", quote: "Lipid panel." },
      decisionRef: "",
    },
    {
      // Note section with NO trigger — must fall back to the cohort, not be dropped.
      id: "note-dx",
      type: "noteSection",
      gate: "none",
      planKind: "none",
      dimension: "diagnosis",
      content: "Document the diagnostic basis and Rotterdam criteria met.",
      rationale: "",
      noteSectionKey: "Diagnosis",
      whenAll: [],
      whenAny: [],
      sourceRef: { source: "2023 Guideline", locator: "Dx", quote: "" },
      decisionRef: "",
    },
  ],
  decisions: [
    {
      id: "d-ovulation",
      question: "First-line ovulation induction?",
      chosen: "Letrozole",
      optionsConsidered: [
        { label: "Letrozole", sourceCitation: "Legro 2014", sourceQuote: "Higher live-birth." },
        { label: "Clomiphene", sourceCitation: "Legacy", sourceQuote: "Historical first-line." },
      ],
    },
  ],
};

describe("buildProtocolFromCompiled", () => {
  const protocol = buildProtocolFromCompiled(FIXTURE);

  it("keeps the note section despite its empty trigger (cohort fallback)", () => {
    const note = protocol.units.find((u) => u.id === "note-dx");
    expect(note).toBeDefined();
    expect(note?.type).toBe("noteSection");
    expect(note?.trigger.all?.length).toBeGreaterThan(0); // got a cohort trigger
  });

  it("keeps a unit whose bad condition was dropped, on its valid condition", () => {
    const broken = protocol.units.find((u) => u.id === "order-broken");
    expect(broken).toBeDefined();
    // the age 'not-a-number' condition is gone; the PCOS condition remains
    expect(broken?.trigger.all?.every((c) => c.fact !== "age")).toBe(true);
    expect(broken?.trigger.all?.some((c) => c.fact === "problems")).toBe(true);
  });

  it("models include vs exclude eligibility gates", () => {
    const gates = protocol.units.filter((u) => u.type === "eligibility");
    expect(gates.find((g) => g.id === "incl-pcos")?.gate).toBe("include");
    expect(gates.find((g) => g.id === "excl-t2dm")?.gate).toBe("exclude");
  });

  it("records the org decisions for dual provenance", () => {
    expect(protocol.decisions.find((d) => d.id === "d-ovulation")?.chosen).toBe("Letrozole");
  });
});

describe("compiled protocol composes correctly on the seeded charts", () => {
  const protocol = buildProtocolFromCompiled(FIXTURE);
  const dana = getPatient("dana-whitfield")!; // PCOS, BMI 32.4, Fertility, no labs
  const priya = getPatient("priya-raman")!; // PCOS, BMI 24.1, Cycle control, recent labs
  const marcus = getPatient("marcus-lindqvist")!; // T2DM, not PCOS

  it("admits Dana and fires the BMI/lab/goal-gated orders + cohort assess", () => {
    const plan = composeVisitPlan(protocol, dana);
    expect(plan.eligible).toBe(true);
    const ids = plan.items.map((i) => i.id);
    expect(ids).toContain("order-ogtt"); // BMI≥25 + no OGTT
    expect(ids).toContain("order-letrozole"); // Fertility goal
    expect(ids).toContain("assess-mood"); // cohort-wide
    expect(plan.noteScaffold.some((s) => s.key === "Diagnosis")).toBe(true);
  });

  it("admits Priya but does NOT fire BMI/fertility-gated orders", () => {
    const plan = composeVisitPlan(protocol, priya);
    expect(plan.eligible).toBe(true);
    const ids = plan.items.map((i) => i.id);
    expect(ids).not.toContain("order-ogtt"); // BMI 24.1 < 25
    expect(ids).not.toContain("order-letrozole"); // goal is Cycle control
    expect(ids).toContain("assess-mood"); // cohort-wide still fires
  });

  it("excludes Marcus (not PCOS, and the exclusion gate would also catch T2DM)", () => {
    const plan = composeVisitPlan(protocol, marcus);
    expect(plan.eligible).toBe(false);
    expect(plan.items).toHaveLength(0);
  });
});
