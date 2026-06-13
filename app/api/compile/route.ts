// ── POST /api/compile ─────────────────────────────────────────────────────────
// Compiles the synthesis + interview into a COMPUTABLE protocol: ProtocolUnit[]
// whose triggers are real predicates over the patient-chart vocabulary, then
// validates/repairs into our Predicate model so it runs deterministically.
//
// Runs on Opus 4.8 (single call) for full authoring capability. We use plain
// JSON output (no grammar-constrained structured decoding, which is far slower
// on large/nested schemas) + a validating builder for safety.

import { hasApiKey, runJsonStreaming } from "@/lib/anthropic";
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

TRIGGER BREADTH — critical so units actually fire:
- Assessment fields, counseling points, follow-up, and note sections apply to the WHOLE cohort: trigger them with just { problems includes <condition> } (broad). Do NOT add BMI/lab/goal conditions to these.
- Reserve NARROW triggers (BMI thresholds, lab:missing, a specific goal) ONLY for orders/therapies they genuinely gate — e.g. OGTT when BMI≥25, letrozole when goals includes Fertility, a lab order only when that lab is missing.
- A typical cohort patient should fire most of the protocol. If you find yourself adding a narrow condition, ask whether it truly gates the action; if not, use the broad cohort trigger.
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

  const userText = `${chartVocabulary()}

SOURCE SYNTHESIS (JSON):
${JSON.stringify(body.synthesis ?? {}, null, 1)}

INTERVIEW TRANSCRIPT:
${convo || "(none)"}

Compile the computable protocol now. Author a COMPLETE set of 10–14 units that covers the protocol — do not under-deliver:
- exactly one inclusion eligibility gate (+ any cohort exclusions);
- every recommended work-up order and assessment field from the synthesis;
- the preferred-therapy order(s) and key counseling points;
- the follow-up unit;
- 3–4 noteSection units for documentation.
Be concise — short content and rationale, but include all clinically indicated units.

Return ONLY a JSON object in a \`\`\`json code block, matching this shape exactly:
${COMPILE_JSON_SHAPE}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const compiled = await runJsonStreaming<CompiledProtocol>(
          {
            system: SYSTEM,
            content: [{ type: "text", text: userText }],
            maxTokens: 14000,
            effort: "low",
            thinking: "disabled",
          },
          {
            onThinking: (t) => send({ type: "thinking", text: t }),
            onText: (t) => send({ type: "draft", text: t }),
          },
        );
        const protocol = buildProtocolFromCompiled(compiled);
        const coverage = loadPatients().map((p) => {
          const plan = composeVisitPlan(protocol, p);
          return { id: p.id, eligible: plan.eligible, items: plan.items.length };
        });
        send({ type: "result", protocol, coverage });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Compile failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
