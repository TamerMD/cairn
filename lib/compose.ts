// ── Encounter composition ─────────────────────────────────────────────────────
// Deterministic: turns a versioned Protocol + a Patient into a VisitPlan — the
// pre-visit action plan + note scaffold — with full provenance on every item.
// This is the spine; it runs client-side and in the test with no network.

import { matchUnit } from "@/lib/match";
import { SEED_TODAY } from "@/lib/predicate";
import type {
  NoteScaffoldSection,
  Patient,
  Protocol,
  ProtocolUnit,
  TriggeringFact,
  VisitPlan,
  VisitPlanItem,
} from "@/lib/types";

const PLAN_KIND_ORDER: Record<string, number> = {
  assess: 0,
  discuss: 1,
  order: 2,
  refer: 3,
};

function approved(units: ProtocolUnit[]): ProtocolUnit[] {
  return units.filter((u) => u.status === "approved");
}

/** A patient is in the protocol's cohort if every eligibility unit fires. */
function evaluateEligibility(
  protocol: Protocol,
  patient: Patient,
  asOf: string,
): { eligible: boolean; facts: TriggeringFact[] } {
  const gates = approved(protocol.units).filter((u) => u.type === "eligibility");
  if (gates.length === 0) return { eligible: false, facts: [] };
  const facts: TriggeringFact[] = [];
  for (const g of gates) {
    const r = matchUnit(g, patient, asOf);
    if (!r.matched) return { eligible: false, facts: [] };
    facts.push(...r.facts);
  }
  // de-dupe facts by fact+detail
  const seen = new Set<string>();
  const deduped = facts.filter((f) => {
    const k = `${f.fact}|${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { eligible: true, facts: deduped };
}

function buildContextSummary(
  patient: Patient,
  condition: string,
  itemCount: number,
): string {
  const { age, sex } = patient.demographics;
  const bmi = patient.vitals.find((v) => v.name.toLowerCase() === "bmi");
  const bmiStr = bmi ? `, BMI ${bmi.value}` : "";
  const meds = patient.meds.length ? ` On ${patient.meds.join(", ")}.` : "";
  return (
    `${age}-year-old ${sex} with ${patient.problems.join(", ")}${bmiStr}. ` +
    `Meets ${condition} service-line criteria.${meds} ` +
    `${itemCount} protocol ${itemCount === 1 ? "item" : "items"} indicated.`
  );
}

export function composeVisitPlan(
  protocol: Protocol,
  patient: Patient,
  asOf: string = SEED_TODAY,
): VisitPlan {
  const { eligible, facts } = evaluateEligibility(protocol, patient, asOf);

  if (!eligible) {
    return {
      patientId: patient.id,
      protocolVersion: protocol.version,
      eligible: false,
      contextSummary: `${patient.demographics.age}-year-old ${patient.demographics.sex} — does not meet ${protocol.condition} service-line criteria.`,
      eligibilityFacts: [],
      items: [],
      noteScaffold: [],
    };
  }

  const items: VisitPlanItem[] = [];
  const noteScaffold: NoteScaffoldSection[] = [];

  for (const unit of approved(protocol.units)) {
    if (unit.type === "eligibility") continue;

    const r = matchUnit(unit, patient, asOf);
    if (!r.matched) continue;

    if (unit.type === "noteSection") {
      noteScaffold.push({
        unitId: unit.id,
        key: unit.noteSectionKey ?? unit.content,
        prompt: unit.content,
        triggeringFacts: r.facts,
      });
      continue;
    }

    if (unit.planKind) {
      items.push({
        id: unit.id,
        unitId: unit.id,
        unitVersion: unit.version,
        kind: unit.planKind,
        content: unit.content,
        rationale: unit.rationale,
        sourceRef: unit.sourceRef,
        decisionRef: unit.decisionRef,
        triggeringFacts: r.facts,
      });
    }
  }

  items.sort(
    (a, b) => (PLAN_KIND_ORDER[a.kind] ?? 9) - (PLAN_KIND_ORDER[b.kind] ?? 9),
  );

  return {
    patientId: patient.id,
    protocolVersion: protocol.version,
    eligible: true,
    contextSummary: buildContextSummary(patient, protocol.condition, items.length),
    eligibilityFacts: facts,
    items,
    noteScaffold,
  };
}
