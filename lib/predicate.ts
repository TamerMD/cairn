// ── Deterministic predicate evaluation ───────────────────────────────────────
// Evaluates a structured Predicate against a Patient and reports *which* facts
// satisfied it. The satisfying facts become point-of-care provenance. Pure and
// time-deterministic: all "freshness" math is relative to `asOf` (default fixed
// to the demo date), never Date.now(), so the test and the app agree.

import type {
  Condition,
  Patient,
  Predicate,
  TriggeringFact,
} from "@/lib/types";

/** Fixed reference date for the seeded demo — keeps composition deterministic. */
export const SEED_TODAY = "2026-06-13";

export interface MatchResult {
  matched: boolean;
  facts: TriggeringFact[];
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso + "T00:00:00Z");
  const b = Date.parse(bIso + "T00:00:00Z");
  return Math.round((a - b) / 86_400_000);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

type Reading = { value: number | string; unit?: string; date: string };

/** Latest lab/vital reading by name (case-insensitive), optionally within a window. */
function latestReading(
  patient: Patient,
  kind: "lab" | "vital",
  name: string,
  asOf: string,
  withinDays?: number,
): { reading: Reading | null; stale: boolean } {
  const pool: Reading[] = (kind === "lab" ? patient.labs : patient.vitals).filter(
    (r) => r.name.toLowerCase() === name.toLowerCase(),
  );
  if (pool.length === 0) return { reading: null, stale: false };
  const sorted = [...pool].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = sorted[0];
  if (withinDays != null) {
    const age = daysBetween(asOf, latest.date);
    if (age > withinDays) return { reading: latest, stale: true };
  }
  return { reading: latest, stale: false };
}

function asNumber(v: number | string | undefined): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

function arrayFact(patient: Patient, fact: string): string[] | null {
  switch (fact) {
    case "problems":
      return patient.problems;
    case "meds":
      return patient.meds;
    case "goals":
      return patient.goals;
    default:
      return null;
  }
}

function scalarFact(patient: Patient, fact: string): number | string | null {
  switch (fact) {
    case "age":
      return patient.demographics.age;
    case "sex":
      return patient.demographics.sex;
    default:
      return null;
  }
}

export function evaluateCondition(
  cond: Condition,
  patient: Patient,
  asOf: string = SEED_TODAY,
): { matched: boolean; fact?: TriggeringFact } {
  const label = cond.label ?? cond.fact;

  // Array-membership facts: problems / meds / goals
  const arr = arrayFact(patient, cond.fact);
  if (arr && cond.op === "includes") {
    const needle = String(cond.value).toLowerCase();
    const hit = arr.find((x) => x.toLowerCase().includes(needle));
    if (hit) return { matched: true, fact: { fact: cond.fact, label, detail: hit } };
    return { matched: false };
  }

  // Lab / vital facts
  const labMatch = cond.fact.match(/^(lab|vital):(.+)$/);
  if (labMatch) {
    const kind = labMatch[1] as "lab" | "vital";
    const name = labMatch[2];
    const { reading, stale } = latestReading(
      patient,
      kind,
      name,
      asOf,
      cond.withinDays,
    );

    if (cond.op === "missing") {
      if (!reading)
        return {
          matched: true,
          fact: { fact: cond.fact, label, detail: "no result on file" },
        };
      if (stale)
        return {
          matched: true,
          fact: {
            fact: cond.fact,
            label,
            detail: `last ${formatDate(reading.date)} — out of window`,
          },
        };
      return { matched: false };
    }

    if (cond.op === "exists") {
      if (reading && !stale)
        return {
          matched: true,
          fact: {
            fact: cond.fact,
            label,
            detail: `${reading.value}${reading.unit ?? ""} (${formatDate(reading.date)})`,
          },
        };
      return { matched: false };
    }

    // numeric comparisons on the latest reading
    const num = reading && !stale ? asNumber(reading.value) : null;
    if (num == null) return { matched: false };
    const detail = `${reading!.value}${reading!.unit ?? ""}`;
    const ok = compareNumeric(num, cond);
    return ok
      ? { matched: true, fact: { fact: cond.fact, label, detail } }
      : { matched: false };
  }

  // Scalar facts: age / sex
  const scalar = scalarFact(patient, cond.fact);
  if (scalar != null) {
    if (cond.op === "equals") {
      const ok = String(scalar).toLowerCase() === String(cond.value).toLowerCase();
      return ok
        ? { matched: true, fact: { fact: cond.fact, label, detail: String(scalar) } }
        : { matched: false };
    }
    const num = asNumber(scalar);
    if (num != null) {
      const ok = compareNumeric(num, cond);
      const unit = cond.fact === "age" ? " yrs" : "";
      return ok
        ? { matched: true, fact: { fact: cond.fact, label, detail: `${num}${unit}` } }
        : { matched: false };
    }
  }

  return { matched: false };
}

function compareNumeric(num: number, cond: Condition): boolean {
  switch (cond.op) {
    case "gt":
      return num > Number(cond.value);
    case "lt":
      return num < Number(cond.value);
    case "gte":
      return num >= Number(cond.value);
    case "lte":
      return num <= Number(cond.value);
    case "equals":
      return num === Number(cond.value);
    case "between": {
      const [lo, hi] = cond.value as [number, number];
      return num >= lo && num <= hi;
    }
    default:
      return false;
  }
}

/** Evaluate a full predicate. `all` is AND, `any` is OR; both may be present. */
export function evaluatePredicate(
  predicate: Predicate,
  patient: Patient,
  asOf: string = SEED_TODAY,
): MatchResult {
  const facts: TriggeringFact[] = [];

  if (predicate.all && predicate.all.length > 0) {
    for (const c of predicate.all) {
      const r = evaluateCondition(c, patient, asOf);
      if (!r.matched) return { matched: false, facts: [] };
      if (r.fact) facts.push(r.fact);
    }
  }

  if (predicate.any && predicate.any.length > 0) {
    const anyHits = predicate.any
      .map((c) => evaluateCondition(c, patient, asOf))
      .filter((r) => r.matched);
    if (anyHits.length === 0) return { matched: false, facts: [] };
    for (const r of anyHits) if (r.fact) facts.push(r.fact);
  }

  // A predicate with neither all nor any never matches (guards empty triggers).
  if (!predicate.all?.length && !predicate.any?.length) {
    return { matched: false, facts: [] };
  }

  return { matched: true, facts };
}
