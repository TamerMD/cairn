// ── POST /api/interview ───────────────────────────────────────────────────────
// One grounded interview turn. Given a fork (with its source-grounded options)
// and the prior answers, Opus produces the question to put to the clinical
// leader — citing what the sources actually said and acknowledging what they've
// already decided. Bounded to the curated fork set, so it's reliably crisp.

import { hasApiKey, runStructured } from "@/lib/anthropic";
import { INTERVIEW_SCHEMA } from "@/lib/schemas";

export const maxDuration = 120;

const SYSTEM = `You are Cairn's protocol authoring interviewer, speaking with a medical director to codify their organization's own best practice.
Ask about ONE decision fork at a time. Open by briefly citing what the uploaded sources actually said for each option (quote the evidence), surface the genuine tension, then ask the director to choose. Acknowledge prior decisions in one short clause when relevant. Be concise, specific, and grounded — never give medical advice or invent evidence. 2–4 sentences.`;

interface Option {
  label: string;
  sourceCitation?: string;
  sourceQuote?: string;
}
interface InterviewBody {
  fork?: { id: string; question: string; tension?: string; options: Option[] };
  priorAnswers?: { question: string; chosenLabel: string }[];
}

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let body: InterviewBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.fork) {
    return Response.json({ error: "Missing fork" }, { status: 400 });
  }

  const prior = (body.priorAnswers ?? [])
    .map((a) => `- ${a.question} → chose: ${a.chosenLabel}`)
    .join("\n");
  const opts = body.fork.options
    .map(
      (o) =>
        `- ${o.label}${o.sourceCitation ? ` [${o.sourceCitation}]` : ""}: "${o.sourceQuote ?? ""}"`,
    )
    .join("\n");

  const userText = `Decision fork: ${body.fork.question}
Tension: ${body.fork.tension ?? ""}
Options grounded in the sources:
${opts}

${prior ? `Decisions already confirmed:\n${prior}\n` : ""}
Write the next interview turn (the question to put to the director for this fork). Return JSON per schema.`;

  try {
    const result = await runStructured<{ assistantMessage: string }>({
      system: SYSTEM,
      content: [{ type: "text", text: userText }],
      schemaName: "interview_turn",
      schema: INTERVIEW_SCHEMA,
      maxTokens: 1200,
      effort: "medium",
    });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Interview turn failed" },
      { status: 500 },
    );
  }
}
