// ── POST /api/ingest ──────────────────────────────────────────────────────────
// Opus reads ALL uploaded source PDFs natively and synthesizes a draft protocol
// across the dimensions a good guideline needs — diagnosis, inclusion/exclusion,
// recommended work-up, preferred therapies, follow-up cadence, monitoring — and
// surfaces the genuine discussion points it discovered (no pre-canned forks).
// Streams Opus's live reasoning + the synthesis as SSE.

import type Anthropic from "@anthropic-ai/sdk";
import { hasApiKey, pdfBlock, runStructuredStreaming } from "@/lib/anthropic";
import { SYNTHESIS_SCHEMA } from "@/lib/schemas";

export const maxDuration = 300;

const SYSTEM = `You are Cairn's clinical protocol synthesis engine for a specialty outpatient group.
You read the uploaded source documents (society guidelines, research papers, and the org's existing protocol) and synthesize a DRAFT operational protocol for the organization. A good protocol spans: diagnosis criteria, inclusion and exclusion criteria for treatment, recommended work-up, preferred therapies, follow-up cadence, and monitoring.
For each dimension, summarize what the sources support and ground it in a real quote with a locator. Then surface the genuine DISCUSSION POINTS you discovered — places where the sources conflict, leave latitude, or where the organization must make a local choice. Do not invent forks; derive them from the actual sources.
You operationalize the organization's OWN care model — never dispense medical advice. Infer the condition/service line from the sources.`;

interface IngestBody {
  pdfs?: { name: string; base64: string }[];
  notes?: string;
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

  const content: Anthropic.ContentBlockParam[] = [];
  for (const p of pdfs) content.push(pdfBlock(p.base64));
  if (body.notes) {
    content.push({ type: "text", text: `Org-provided notes:\n${body.notes}` });
  }
  content.push({
    type: "text",
    text: `Synthesize a draft protocol from the ${pdfs.length} uploaded source${pdfs.length === 1 ? "" : "s"}${body.notes ? " and the notes" : ""}. Cover every applicable dimension (diagnosis, inclusion, exclusion, workup, preferredTherapy, followUp, monitoring, counseling), ground each in a real quote, and surface the genuine discussion points you found. Return JSON per the schema.`,
  });

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
            schema: SYNTHESIS_SCHEMA,
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
          error: e instanceof Error ? e.message : "Synthesis failed",
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
