// ── JSON schemas + compile skeleton ───────────────────────────────────────────
// Schemas are structured-output compatible: every object has
// additionalProperties:false and there are no min/max/length constraints.
// The compile step keeps triggers/types/planKind canonical (deterministic
// matching) while Opus authors content, rationale, and grounded provenance.

import { PCOS_FORKS } from "@/data/pcos-forks";
import { loadSeedProtocol } from "@/lib/store";
import type { Decision, Protocol, ProtocolUnit } from "@/lib/types";

const UNIT_TYPES = [
  "eligibility",
  "order",
  "captureField",
  "noteSection",
  "followUp",
];

export const INGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    candidateUnits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          type: { type: "string", enum: UNIT_TYPES },
          rationale: { type: "string" },
          sourceQuote: { type: "string" },
          sourceLocator: { type: "string" },
        },
        required: ["title", "type", "rationale", "sourceQuote", "sourceLocator"],
      },
    },
    forks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          tension: { type: "string" },
          recommendedLabel: { type: "string" },
          options: {
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
        required: ["id", "question", "tension", "options", "recommendedLabel"],
      },
    },
  },
  required: ["sources", "candidateUnits", "forks"],
} as const;

export const INTERVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { assistantMessage: { type: "string" } },
  required: ["assistantMessage"],
} as const;

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

export const COMPILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          rationale: { type: "string" },
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
        },
        required: ["id", "rationale", "sourceRef"],
      },
    },
  },
  required: ["units"],
} as const;

// ── Decision → protocol variants ──────────────────────────────────────────────

export interface InterviewDecision {
  forkId: string;
  question: string;
  chosenLabel: string;
  options: { label: string; sourceCitation: string; sourceQuote?: string }[];
}

function has(label: string, needle: string): boolean {
  return label.toLowerCase().includes(needle.toLowerCase());
}

/** Content variants a decision selects. Triggers/types stay canonical. */
function unitContentFor(
  forkId: string,
  chosen: string,
): { unitId: string; content: string } | null {
  switch (forkId) {
    case "fork-ovulation":
      return {
        unitId: "u-letrozole",
        content: has(chosen, "clomiphene")
          ? "Offer clomiphene citrate as first-line ovulation induction"
          : "Offer letrozole as first-line ovulation induction",
      };
    case "fork-glycaemic":
      return {
        unitId: "u-ogtt",
        content: has(chosen, "hba1c") || has(chosen, "fasting")
          ? "Order HbA1c for baseline glycaemic screening"
          : "Order 75 g 2-hour oral glucose tolerance test (OGTT)",
      };
    case "fork-amh":
      return {
        unitId: "u-amh",
        content: has(chosen, "ultrasound")
          ? "Order pelvic ultrasound to assess polycystic ovarian morphology"
          : "Order serum AMH to define PCOM (in lieu of pelvic ultrasound)",
      };
    default:
      return null;
  }
}

/**
 * Build an authored protocol from confirmed interview decisions. Starts from the
 * canonical skeleton (so it always composes), applies content variants the
 * decisions select, sets decisionRefs, and records the Decision objects.
 */
export function applyDecisions(decisions: InterviewDecision[]): Protocol {
  const protocol = loadSeedProtocol();
  const byFork = new Map(decisions.map((d) => [d.forkId, d]));

  const bump = (id: string, patch: Partial<ProtocolUnit>) => {
    protocol.units = protocol.units.map((u) =>
      u.id === id ? { ...u, ...patch, version: u.version + 1 } : u,
    );
  };

  for (const fork of PCOS_FORKS) {
    const d = byFork.get(fork.id);
    if (!d) continue;
    const variant = unitContentFor(fork.id, d.chosenLabel);
    if (variant) bump(variant.unitId, { content: variant.content });
  }

  // Follow-up unit composes cadence + owner decisions.
  const cadence = byFork.get("fork-cadence")?.chosenLabel;
  const owner = byFork.get("fork-followup-owner")?.chosenLabel;
  if (cadence || owner) {
    const cad = cadence && has(cadence, "6") ? "6-month" : "3-month";
    const own = owner && has(owner, "physician") ? "physician" : "nurse-led";
    bump("u-followup", { content: `Schedule ${cad} ${own} follow-up` });
  }

  // Record the org decisions (dual provenance source #2).
  protocol.decisions = PCOS_FORKS.map((fork) => {
    const d = byFork.get(fork.id);
    const existing = protocol.decisions.find((x) => x.id === fork.decisionId);
    const chosen = d?.chosenLabel ?? existing?.chosen ?? fork.options[0].label;
    return {
      id: fork.decisionId,
      version: (existing?.version ?? 1) + (d ? 1 : 0),
      question: fork.question,
      optionsConsidered: (d?.options ?? fork.options).map((o) => ({
        label: o.label,
        sourceCitation:
          ("sourceCitation" in o && o.sourceCitation) ||
          ("sourceHint" in o ? (o as { sourceHint: string }).sourceHint : ""),
        sourceQuote: "sourceQuote" in o ? o.sourceQuote : undefined,
      })),
      chosen,
    } as Decision;
  });

  protocol.version = protocol.version + 1;
  return protocol;
}

/** Overlay Opus-authored rationale + grounded source provenance by unit id. */
export function overlayEnrichment(
  protocol: Protocol,
  units: { id: string; rationale: string; sourceRef: ProtocolUnit["sourceRef"] }[],
): Protocol {
  const byId = new Map(units.map((u) => [u.id, u]));
  return {
    ...protocol,
    units: protocol.units.map((u) => {
      const e = byId.get(u.id);
      if (!e) return u;
      return { ...u, rationale: e.rationale, sourceRef: e.sourceRef };
    }),
  };
}
