// ── Unit-level matching ───────────────────────────────────────────────────────
// Thin layer over the predicate engine: does this protocol unit fire for this
// patient, and which facts triggered it?

import { evaluatePredicate, SEED_TODAY, type MatchResult } from "@/lib/predicate";
import type { Patient, ProtocolUnit } from "@/lib/types";

export function matchUnit(
  unit: ProtocolUnit,
  patient: Patient,
  asOf: string = SEED_TODAY,
): MatchResult {
  return evaluatePredicate(unit.trigger, patient, asOf);
}
