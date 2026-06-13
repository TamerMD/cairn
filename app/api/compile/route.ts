// ── POST /api/compile ─────────────────────────────────────────────────────────
// Compiles the synthesis + interview into a COMPUTABLE protocol: ProtocolUnit[]
// whose triggers are real predicates over the patient-chart vocabulary, then
// validates/repairs into our Predicate model so it runs deterministically.
//
// Runs on Opus 4.8 (single call) for full authoring capability. We use plain
// JSON output (no grammar-constrained structured decoding, which is far slower
// on large/nested schemas) + a validating builder for safety.

import { hasApiKey, runJson } from "@/lib/anthropic";
import {
  buildProtocolFromCompiled,
  chartVocabulary,
  COMPILE_JSON_SHAPE,
  type CompiledProtocol,
} from "@/lib/schemas";
import { composeVisitPlan } from "@/lib/compose";
import { loadPatients } from "@/lib/store";

export const maxDuration = 120;

const SYSTEM = `You are Cairn's protocol compiler. Turn the synthesis and the interview into a COMPUTABLE protocol: a set of units that run deterministically on patient charts.

Author units across the dimensions defined in the interview: the cohort gate, recommended work-up (orders), capture/assessment fields, counseling/discussion points, preferred-therapy orders, follow-up (type "followUp"), and note-scaffold sections (type "noteSection").

ELIGIBILITY — get this right, it decides who the protocol runs on:
- Inclusion: type "eligibility", gate "include". The patient MUST match (e.g. condition on problem list, sex, reproductive age). ANDed — keep broad enough to admit every patient the protocol covers. Usually ONE inclusion gate.
- Exclusion (cohort-level only): type "eligibility", gate "exclude" — the patient is removed if they MATCH. Do NOT phrase exclusions as "must have X".
- A care GOAL (fertility, cycle control) or therapy CONTRAINDICATION (e.g. pregnancy before letrozole) is NOT eligibility. Never gate the cohort on a goal. Put goal/contraindication logic on the SPECIFIC order's own trigger.

TRIGGERS must be COMPUTABLE over the chart vocabulary provided. Use the listed fact names so units fire on real charts. For non-eligibility units, gate is "none".
Reflect the director's confirmed choices: set decisionRef to the matching decision id and record those decisions. Ground each unit's sourceRef in the evidence. Set planKind for actionable units. Never give medical advice.`;

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let body: { synthesis?: unknown; messages?: { role: string; content: string }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const convo = (body.messages ?? [])
    .map((m) => `${m.role === "assistant" ? "Cairn" : "Director"}: ${m.content}`)
    .join("\n");

  try {
    const compiled = await runJson<CompiledProtocol>({
      system: SYSTEM,
      content: [
        {
          type: "text",
          text: `${chartVocabulary()}

SOURCE SYNTHESIS (JSON):
${JSON.stringify(body.synthesis ?? {}, null, 1)}

INTERVIEW TRANSCRIPT:
${convo || "(none)"}

Compile the computable protocol now. Author a focused set of about 8–12 units total (one inclusion gate, any cohort exclusions, the core work-up/therapy/follow-up, and 3–4 note sections). Be concise — short content and rationale.

Return ONLY a JSON object in a \`\`\`json code block, matching this shape exactly:
${COMPILE_JSON_SHAPE}`,
        },
      ],
      maxTokens: 12000,
      effort: "low",
      thinking: "disabled",
    });

    const protocol = buildProtocolFromCompiled(compiled);

    const coverage = loadPatients().map((p) => {
      const plan = composeVisitPlan(protocol, p);
      return { id: p.id, eligible: plan.eligible, items: plan.items.length };
    });

    return Response.json({ protocol, coverage });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Compile failed" },
      { status: 500 },
    );
  }
}
