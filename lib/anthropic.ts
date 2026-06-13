// ── Anthropic client + structured-output helper ──────────────────────────────
// Server-side only. Opus 4.8 with adaptive thinking and JSON-schema structured
// outputs (output_config.format) — this keeps every model call agentic and
// schema-validated, never freeform chat. PDFs are read natively via base64
// document content blocks.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-4-8";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!client) {
    client = new Anthropic({ timeout: 180_000, maxRetries: 1 });
  }
  return client;
}

/** A base64 PDF document content block. */
export function pdfBlock(base64: string): Anthropic.DocumentBlockParam {
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
  };
}

type Effort = "low" | "medium" | "high" | "max";

/**
 * Run Opus with a forced JSON schema and return the parsed, validated object.
 * `content` is the user-turn content (text + document blocks).
 */
export async function runStructured<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
}): Promise<T> {
  const c = getClient();
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: opts.effort ?? "high",
      format: {
        type: "json_schema",
        schema: opts.schema,
      },
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text.trim()) {
    throw new Error("Model returned no structured output");
  }
  return JSON.parse(text) as T;
}
