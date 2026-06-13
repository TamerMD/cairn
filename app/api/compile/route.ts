// ── POST /api/compile ─────────────────────────────────────────────────────────
// Confirmed decisions → structured ProtocolUnit[] with dual provenance. The
// decisions select content variants on the canonical skeleton (so the protocol
// always composes deterministically at the point of care); Opus then authors
// each unit's rationale and grounded source citation from the real evidence
// surfaced during ingestion. Falls back to the seeded provenance on failure.

import { hasApiKey, runStructured } from "@/lib/anthropic";
import {
  applyDecisions,
  COMPILE_SCHEMA,
  overlayEnrichment,
  type InterviewDecision,
} from "@/lib/schemas";
import type { ProtocolUnit } from "@/lib/types";

export const maxDuration = 300;

const SYSTEM = `You are Cairn's protocol compiler. You are given the org's confirmed decisions and the candidate evidence extracted from their uploaded sources, plus the canonical set of protocol units (with fixed ids, types, and triggers).
For each unit, write a tight one-sentence clinical rationale and attach the single best grounding source citation (source name, locator, and a real quote) drawn from the provided evidence. Do not invent quotes; if the evidence doesn't cover a unit, cite the most relevant source you were given. You operationalize the org's own protocol — never give medical advice.`;

interface CompileBody {
  decisions?: InterviewDecision[];
  candidateUnits?: {
    title: string;
    type: string;
    rationale: string;
    sourceQuote: string;
    sourceLocator: string;
  }[];
  sources?: { name: string }[];
}

export async function POST(request: Request) {
  let body: CompileBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Deterministic structure first — this always composes at the point of care.
  let protocol = applyDecisions(body.decisions ?? []);

  // Live grounding pass (best-effort; seeded provenance remains if it fails).
  if (hasApiKey()) {
    try {
      const unitBrief = protocol.units
        .map(
          (u) =>
            `- ${u.id} (${u.type}${u.decisionRef ? `, decision: ${u.decisionRef}` : ""}): ${u.content}`,
        )
        .join("\n");
      const evidence = (body.candidateUnits ?? [])
        .map(
          (c) =>
            `- ${c.title} [${c.sourceLocator}]: "${c.sourceQuote}"`,
        )
        .join("\n");
      const decisions = (body.decisions ?? [])
        .map((d) => `- ${d.question} → ${d.chosenLabel}`)
        .join("\n");

      const result = await runStructured<{
        units: { id: string; rationale: string; sourceRef: ProtocolUnit["sourceRef"] }[];
      }>({
        system: SYSTEM,
        content: [
          {
            type: "text",
            text: `Sources: ${(body.sources ?? []).map((s) => s.name).join(", ") || "uploaded sources"}

Confirmed org decisions:
${decisions || "(none — defaults retained)"}

Evidence extracted from the sources:
${evidence || "(none)"}

Canonical protocol units to ground:
${unitBrief}

Return JSON per schema: one entry per unit id above.`,
          },
        ],
        schemaName: "compiled_units",
        schema: COMPILE_SCHEMA,
        maxTokens: 16000,
        effort: "high",
      });
      protocol = overlayEnrichment(protocol, result.units);
    } catch {
      // keep deterministic protocol with seeded provenance
    }
  }

  return Response.json({ protocol });
}
