// ── POST /api/interview ───────────────────────────────────────────────────────
// A free-flowing, model-driven interview that the clinical leader steers. Opus
// works from the synthesis to fill out the protocol across its dimensions,
// asking focused, source-grounded questions and adapting to the director's
// answers and redirections. It signals readyToCompile when the protocol is
// sufficiently specified (the user can also choose to compile at any time).

import { hasApiKey, runStructured } from "@/lib/anthropic";
import { INTERVIEW_SCHEMA } from "@/lib/schemas";

export const maxDuration = 120;

const SYSTEM = `You are Cairn's protocol authoring partner, working with a medical director to define their organization's OWN computable protocol.
You have a synthesis of their uploaded sources. Collaboratively shape a protocol spanning: diagnosis, inclusion/exclusion criteria, recommended work-up, preferred therapies, follow-up cadence, and monitoring.
Conduct a natural, free-flowing conversation: ask ONE focused question at a time, grounded in what the sources say (cite briefly), and genuinely adapt to the director's answers — they may redirect, add constraints, or override the evidence; honor their choices (it's their care model). Track what's still undefined and steer toward it, but don't railroad. When the key dimensions are sufficiently specified — or the director signals they're done — set readyToCompile true and give a one-line summary of what you'll compile. Keep turns to 2–4 sentences. Never give medical advice; you operationalize their protocol.`;

interface Msg {
  role: "assistant" | "user";
  content: string;
}
interface InterviewBody {
  synthesis?: {
    condition?: string;
    summary?: string;
    dimensions?: { dimension: string; summary: string }[];
    discussionPoints?: { question: string; why: string }[];
  };
  messages?: Msg[];
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

  const s = body.synthesis ?? {};
  const dims = (s.dimensions ?? [])
    .map((d) => `- ${d.dimension}: ${d.summary}`)
    .join("\n");
  const points = (s.discussionPoints ?? [])
    .map((p) => `- ${p.question} (${p.why})`)
    .join("\n");
  const convo = (body.messages ?? [])
    .map((m) => `${m.role === "assistant" ? "You" : "Director"}: ${m.content}`)
    .join("\n");

  const userText = `Condition / service line: ${s.condition ?? "(infer)"}
Source synthesis by dimension:
${dims || "(none)"}

Discussion points discovered in the sources:
${points || "(none)"}

Conversation so far:
${convo || "(none yet — open the interview with your first question)"}

Produce the next assistant turn. Return JSON per schema.`;

  try {
    const result = await runStructured<{
      assistantMessage: string;
      readyToCompile: boolean;
    }>({
      system: SYSTEM,
      content: [{ type: "text", text: userText }],
      schema: INTERVIEW_SCHEMA,
      maxTokens: 1500,
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
