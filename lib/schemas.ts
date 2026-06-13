// ── JSON schemas + protocol compiler ─────────────────────────────────────────
// Opus authors the protocol with autonomy: it synthesizes across dimensions,
// runs a free-flowing interview, then compiles to COMPUTABLE units whose
// triggers are real predicates over the patient-chart vocabulary. Schemas use
// only primitives / enums / arrays (all required) so structured output is
// reliable; the compiler validates and repairs into our Predicate model.

import { loadPatients } from "@/lib/store";
import type {
  Condition,
  Decision,
  PlanKind,
  Predicate,
  PredicateOp,
  Protocol,
  ProtocolUnit,
  UnitType,
} from "@/lib/types";

const DIMENSIONS = [
  "diagnosis",
  "inclusion",
  "exclusion",
  "workup",
  "preferredTherapy",
  "followUp",
  "monitoring",
  "counseling",
  "other",
];
const UNIT_TYPES = [
  "eligibility",
  "order",
  "captureField",
  "noteSection",
  "followUp",
];
const PLAN_KINDS = ["assess", "discuss", "order", "refer", "none"];
const OPS = [
  "includes",
  "excludes",
  "equals",
  "gt",
  "lt",
  "gte",
  "lte",
  "between",
  "exists",
  "missing",
];

// ── Ingest: synthesis across dimensions + discovered discussion points ────────

export const SYNTHESIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    condition: { type: "string" },
    summary: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          dimension: { type: "string", enum: DIMENSIONS },
          summary: { type: "string" },
          sourceQuote: { type: "string" },
          sourceLocator: { type: "string" },
        },
        required: ["dimension", "summary", "sourceQuote", "sourceLocator"],
      },
    },
    discussionPoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { question: { type: "string" }, why: { type: "string" } },
        required: ["question", "why"],
      },
    },
  },
  required: ["condition", "summary", "sources", "dimensions", "discussionPoints"],
} as const;

// ── Interview: free-flowing, model-driven, user-steered ───────────────────────

export const INTERVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: { type: "string" },
    readyToCompile: { type: "boolean" },
  },
  required: ["assistantMessage", "readyToCompile"],
} as const;

// ── Compile: full computable units with Opus-authored triggers ────────────────

const CONDITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fact: { type: "string" },
    op: { type: "string", enum: OPS },
    value: { type: "string" },
    withinDays: { type: "number" },
    label: { type: "string" },
  },
  required: ["fact", "op", "value", "withinDays", "label"],
};

export const COMPILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    condition: { type: "string" },
    units: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: UNIT_TYPES },
          gate: { type: "string", enum: ["include", "exclude", "none"] },
          planKind: { type: "string", enum: PLAN_KINDS },
          dimension: { type: "string", enum: DIMENSIONS },
          content: { type: "string" },
          rationale: { type: "string" },
          noteSectionKey: { type: "string" },
          whenAll: { type: "array", items: CONDITION_SCHEMA },
          whenAny: { type: "array", items: CONDITION_SCHEMA },
          sourceRef: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: { type: "string" },
              locator: { type: "string" },
              quote: { type: "string" },
            },
            required: ["source", "locator", "quote"],
          },
          decisionRef: { type: "string" },
        },
        required: [
          "id",
          "type",
          "gate",
          "planKind",
          "dimension",
          "content",
          "rationale",
          "noteSectionKey",
          "whenAll",
          "whenAny",
          "sourceRef",
          "decisionRef",
        ],
      },
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          chosen: { type: "string" },
          optionsConsidered: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                sourceCitation: { type: "string" },
                sourceQuote: { type: "string" },
              },
              required: ["label", "sourceCitation", "sourceQuote"],
            },
          },
        },
        required: ["id", "question", "chosen", "optionsConsidered"],
      },
    },
  },
  required: ["condition", "units", "decisions"],
} as const;

// ── Note + reconciliation (post-capture) ─────────────────────────────────────

export const NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    generatedNote: {
      type: "object",
      additionalProperties: false,
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              key: { type: "string" },
              content: { type: "string" },
              citations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { transcriptSpanId: { type: "string" } },
                  required: ["transcriptSpanId"],
                },
              },
            },
            required: ["key", "content", "citations"],
          },
        },
      },
      required: ["sections"],
    },
    addressedExtraction: {
      type: "object",
      additionalProperties: false,
      properties: {
        addressedPlanItemIds: { type: "array", items: { type: "string" } },
        evidenceByItem: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              itemId: { type: "string" },
              transcriptSpanId: { type: "string" },
            },
            required: ["itemId", "transcriptSpanId"],
          },
        },
        newItems: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              content: { type: "string" },
              evidenceSpanId: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["content", "evidenceSpanId", "rationale"],
          },
        },
      },
      required: ["addressedPlanItemIds", "evidenceByItem", "newItems"],
    },
  },
  required: ["generatedNote", "addressedExtraction"],
} as const;

// Per-unit shape, shared by the fan-out group calls.
export const UNIT_JSON_SHAPE = `Each unit:
{
  "id": "kebab-case-id",
  "type": "eligibility | order | captureField | noteSection | followUp",
  "gate": "include | exclude | none",   // eligibility only; else "none"
  "planKind": "assess | discuss | order | refer | none",
  "dimension": "diagnosis | inclusion | exclusion | workup | preferredTherapy | followUp | monitoring | counseling | other",
  "content": "short clinician-facing text",
  "rationale": "one short sentence",
  "noteSectionKey": "section title (noteSection only, else \\"\\")",
  "whenAll": [ { "fact": "problems", "op": "includes", "value": "PCOS", "withinDays": 0, "label": "Problem list" } ],
  "whenAny": [],
  "sourceRef": { "source": "string", "locator": "string", "quote": "string" },
  "decisionRef": "decision id or \\"\\""
}
Ops: includes/excludes (array facts: problems, goals, meds), equals (sex or numbers), gt/lt/gte/lte (numbers), between (value "18,45"), exists/missing (lab:/vital:, optional withinDays; value ""). Always include withinDays (0 if none) and label. Triggers must use the chart vocabulary so units fire on real charts.`;

// Human-readable JSON shape for the (fast, non-grammar) compile call.
export const COMPILE_JSON_SHAPE = `{
  "condition": "string",
  "units": [
    {
      "id": "kebab-case-id",
      "type": "eligibility | order | captureField | noteSection | followUp",
      "gate": "include | exclude | none",   // eligibility only; else "none"
      "planKind": "assess | discuss | order | refer | none",
      "dimension": "diagnosis | inclusion | exclusion | workup | preferredTherapy | followUp | monitoring | counseling | other",
      "content": "short clinician-facing text",
      "rationale": "one short sentence",
      "noteSectionKey": "section title (noteSection only, else \\"\\")",
      "whenAll": [ { "fact": "problems", "op": "includes", "value": "PCOS", "withinDays": 0, "label": "Problem list" } ],
      "whenAny": [],
      "sourceRef": { "source": "string", "locator": "string", "quote": "string" },
      "decisionRef": "decision id or \\"\\""
    }
  ],
  "decisions": [
    { "id": "kebab-id", "question": "string", "chosen": "string",
      "optionsConsidered": [ { "label": "string", "sourceCitation": "string", "sourceQuote": "string" } ] }
  ]
}
Ops: includes/excludes (array facts: problems, goals, meds), equals (sex or numbers), gt/lt/gte/lte (numbers), between (value "18,45"), exists/missing (lab:/vital: with optional withinDays; value ""). Always include withinDays (0 if none) and label.`;

// ── Chart vocabulary (so authored triggers actually compute on real charts) ───

export function chartVocabulary(): string {
  const patients = loadPatients();
  const uniq = (xs: string[]) => Array.from(new Set(xs)).sort();
  const problems = uniq(patients.flatMap((p) => p.problems));
  const goals = uniq(patients.flatMap((p) => p.goals));
  const meds = uniq(patients.flatMap((p) => p.meds));
  const labs = uniq(patients.flatMap((p) => p.labs.map((l) => l.name)));
  const vitals = uniq(patients.flatMap((p) => p.vitals.map((v) => v.name)));
  return [
    "Patient-chart fact vocabulary (write triggers against these so the guideline computes on real charts):",
    `- problems (array; op includes/excludes): ${problems.join(", ")}`,
    `- goals (array; op includes/excludes): ${goals.join(", ")}`,
    `- meds (array; op includes/excludes): ${meds.join(", ") || "(none)"}`,
    `- age (number; op gt/lt/gte/lte/between/equals)`,
    `- sex (string; op equals): female, male, other`,
    `- vital:<Name> (op gt/lt/gte/lte/between/exists/missing): ${vitals.map((v) => `vital:${v}`).join(", ")}`,
    `- lab:<Name> (op gt/lt/gte/lte/between/exists/missing; use withinDays for freshness): ${labs.map((l) => `lab:${l}`).join(", ")}`,
    "Notes: 'between' value is two numbers like \"18,45\". 'exists'/'missing' ignore value (set value to \"\"). withinDays 0 means no freshness window. You may introduce new lab/vital names if the guideline needs them, but prefer the listed ones so units fire on existing charts.",
  ].join("\n");
}

// ── Compiler: validated structured output → computable Protocol ───────────────

interface RawCondition {
  fact: string;
  op: string;
  value: string;
  withinDays: number;
  label: string;
}
interface RawUnit {
  id: string;
  type: string;
  gate: string;
  planKind: string;
  dimension: string;
  content: string;
  rationale: string;
  noteSectionKey: string;
  whenAll: RawCondition[];
  whenAny: RawCondition[];
  sourceRef: { source: string; locator: string; quote: string };
  decisionRef: string;
}
export interface CompiledProtocol {
  condition: string;
  units: RawUnit[];
  decisions: {
    id: string;
    question: string;
    chosen: string;
    optionsConsidered: { label: string; sourceCitation: string; sourceQuote?: string }[];
  }[];
}

const isNumeric = (s: string) => s.trim() !== "" && !Number.isNaN(Number(s));

function toCondition(rc: RawCondition): Condition | null {
  const op = rc.op as PredicateOp;
  if (!OPS.includes(op) || !rc.fact) return null;
  const base = {
    fact: rc.fact,
    op,
    label: rc.label || rc.fact,
    ...(rc.withinDays > 0 ? { withinDays: rc.withinDays } : {}),
  };
  if (op === "exists" || op === "missing") return base as Condition;
  if (op === "includes" || op === "excludes")
    return { ...base, value: rc.value } as Condition;
  if (op === "between") {
    const parts = rc.value.split(/[,\-–]/).map((s) => Number(s.trim()));
    if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
    return { ...base, value: [parts[0], parts[1]] } as Condition;
  }
  // numeric/equals
  if (op === "equals")
    return {
      ...base,
      value: isNumeric(rc.value) ? Number(rc.value) : rc.value,
    } as Condition;
  if (!isNumeric(rc.value)) return null;
  return { ...base, value: Number(rc.value) } as Condition;
}

function planKindFor(type: string, given: string): PlanKind | undefined {
  if (given && given !== "none") return given as PlanKind;
  if (type === "order") return "order";
  if (type === "captureField") return "assess";
  if (type === "followUp") return "refer";
  return undefined;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "protocol";
}

/** Build a validated, computable Protocol from Opus's compiled output. */
export function buildProtocolFromCompiled(data: CompiledProtocol): Protocol {
  const usedIds = new Set<string>();
  const units: ProtocolUnit[] = [];
  const condition = data.condition?.trim() || "Protocol";
  // Cohort trigger used as a fallback so a trigger-less unit (e.g. a note
  // section, or one whose conditions failed to parse) still fires for the
  // cohort instead of being silently dropped.
  const cohortCondition: Condition = {
    fact: "problems",
    op: "includes",
    value: condition,
    label: "Problem list",
  };

  for (const ru of data.units ?? []) {
    const all = (ru.whenAll ?? []).map(toCondition).filter(Boolean) as Condition[];
    const any = (ru.whenAny ?? []).map(toCondition).filter(Boolean) as Condition[];

    // Eligibility gates must carry real conditions; everything else falls back
    // to the cohort trigger rather than being dropped.
    if (all.length === 0 && any.length === 0) {
      if (ru.type === "eligibility") continue;
      all.push(cohortCondition);
    }

    const trigger: Predicate = {};
    if (all.length) trigger.all = all;
    if (any.length) trigger.any = any;

    let id = ru.id?.trim() || `${slug(ru.dimension || ru.type)}-${units.length}`;
    while (usedIds.has(id)) id = `${id}-${units.length}`;
    usedIds.add(id);

    const type = (UNIT_TYPES.includes(ru.type) ? ru.type : "captureField") as UnitType;

    units.push({
      id,
      version: 1,
      type,
      content: ru.content,
      trigger,
      rationale: ru.rationale,
      sourceRef: ru.sourceRef,
      status: "approved",
      planKind: type === "eligibility" || type === "noteSection" ? undefined : planKindFor(type, ru.planKind),
      noteSectionKey: type === "noteSection" ? ru.noteSectionKey || ru.content : undefined,
      decisionRef: ru.decisionRef || undefined,
      dimension: ru.dimension || undefined,
      gate:
        type === "eligibility"
          ? ru.gate === "exclude"
            ? "exclude"
            : "include"
          : undefined,
    });
  }

  // Guarantee an eligibility gate so the protocol composes at the point of care.
  if (!units.some((u) => u.type === "eligibility")) {
    units.unshift({
      id: "u-elig",
      version: 1,
      type: "eligibility",
      content: `${condition} service-line eligibility`,
      trigger: {
        all: [
          { fact: "problems", op: "includes", value: condition, label: "Problem list" },
        ],
      },
      rationale: `Patients with ${condition} on the problem list are governed by this protocol.`,
      sourceRef: { source: "Org protocol", locator: "Eligibility", quote: "" },
      status: "approved",
      dimension: "inclusion",
    });
  }

  const decisions: Decision[] = (data.decisions ?? []).map((d, i) => ({
    id: d.id?.trim() || `d-${i}`,
    version: 1,
    question: d.question,
    chosen: d.chosen,
    optionsConsidered: (d.optionsConsidered ?? []).map((o) => ({
      label: o.label,
      sourceCitation: o.sourceCitation,
      sourceQuote: o.sourceQuote,
    })),
  }));

  return { id: `${slug(condition)}-v1`, condition, version: 1, units, decisions };
}
