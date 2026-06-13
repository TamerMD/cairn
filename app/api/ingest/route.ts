// ── POST /api/ingest ──────────────────────────────────────────────────────────
// Opus reads the uploaded source PDFs natively and decomposes them into
// structured candidate protocol units + the genuine decision forks (grounded in
// real quotes), steered toward the curated PCOS fork set so the interview stays
// crisp. Structured output only — never freeform chat.

import type Anthropic from "@anthropic-ai/sdk";
import { hasApiKey, pdfBlock, runStructuredStreaming } from "@/lib/anthropic";
import { INGEST_SCHEMA } from "@/lib/schemas";
import { PCOS_FORKS } from "@/data/pcos-forks";

export const maxDuration = 300;

const SYSTEM = `You are Cairn's clinical protocol synthesis engine for a specialty outpatient group.
You read uploaded source documents (society guideline PDFs, research papers, and the org's existing protocol) and decompose them into (a) structured candidate protocol elements and (b) the genuine decision forks where the sources conflict or leave a local choice open.
You operationalize the organization's OWN care model — you never dispense medical advice. Ground every quote in the actual uploaded text; if a source is silent on an option, set its quote to "(not addressed in the provided sources)".`;

interface IngestBody {
  pdfs?: { name: string; base64: string }[];
  notes?: string;
  condition?: string;
}

export async function POST(request: Request) {
  if (!hasApiKey()) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pdfs = body.pdfs ?? [];
  if (pdfs.length === 0 && !body.notes) {
    return Response.json(
      { error: "Provide at least one source PDF or pasted notes." },
      { status: 400 },
    );
  }

  const forkBrief = PCOS_FORKS.map(
    (f) =>
      `- ${f.id}: ${f.question} Options: ${f.options
        .map((o) => o.label)
        .join(" | ")}. (${f.tension})`,
  ).join("\n");

  const content: Anthropic.ContentBlockParam[] = [];
  for (const p of pdfs) content.push(pdfBlock(p.base64));
  if (body.notes) {
    content.push({ type: "text", text: `Org-provided notes:\n${body.notes}` });
  }
  content.push({
    type: "text",
    text: `Condition / service line: ${body.condition ?? "PCOS"}.

Resolve this curated, pre-validated set of decision forks — these are the decision points this service line must settle. Keep the fork ids exactly as given. For each fork, ground each option in a real quote drawn from the uploaded sources (with a citation locator), and name the option the evidence most supports as recommendedLabel.

${forkBrief}

Also extract 4–8 candidate protocol units you find directly supported in the sources (orders, capture fields, note sections, follow-up), each with a supporting quote and locator.

Return JSON conforming to the schema.`,
  });

  // Stream Opus's live reasoning trace, then the final structured result, as SSE.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const result = await runStructuredStreaming(
          {
            system: SYSTEM,
            content,
            schema: INGEST_SCHEMA,
            maxTokens: 16000,
            effort: "high",
          },
          {
            onThinking: (text) => send({ type: "thinking", text }),
            onPhase: (phase) => send({ type: "phase", phase }),
            onText: (text) => send({ type: "draft", text }),
          },
        );
        send({ type: "result", result });
      } catch (e) {
        send({
          type: "error",
          error: e instanceof Error ? e.message : "Ingestion failed",
        });
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
