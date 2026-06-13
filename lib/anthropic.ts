// ── Anthropic client + structured-output helper ──────────────────────────────
// Server-side only. Opus 4.8 with adaptive thinking and JSON-schema structured
// outputs (output_config.format) — this keeps every model call agentic and
// schema-validated, never freeform chat. PDFs are read natively via base64
// document content blocks.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-4-8";
/** Faster model for mechanical transformation steps (e.g. JSON compilation). */
export const FAST_MODEL = "claude-sonnet-4-6";

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
  schemaName?: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
  thinking?: "adaptive" | "disabled";
}): Promise<T> {
  const c = getClient();
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: opts.thinking ?? "adaptive" },
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

/** Strip ```json fences / prose around a JSON object or array. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

/**
 * Plain JSON generation (NO grammar-constrained structured output). Much faster
 * than runStructured for large/deeply-nested shapes — constrained decoding gets
 * very slow on big schemas. Pair with a validating builder for safety. Caller's
 * prompt must describe the JSON shape; we parse fenced/bare JSON from the reply.
 */
export async function runJson<T>(opts: {
  system: string;
  content: Anthropic.ContentBlockParam[];
  maxTokens?: number;
  effort?: Effort;
  thinking?: "adaptive" | "disabled";
  model?: string;
}): Promise<T> {
  const c = getClient();
  const response = await c.messages.create({
    model: opts.model ?? MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: opts.thinking ?? "disabled" },
    output_config: { effort: opts.effort ?? "low" },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("Model returned no output");
  return JSON.parse(extractJson(text)) as T;
}

/**
 * Streaming plain-JSON generation. Streams thinking + the JSON text as it's
 * produced (so the UI shows live progress and the connection never idles), then
 * parses fenced/bare JSON from the full reply. No grammar constraint.
 */
export async function runJsonStreaming<T>(
  opts: {
    system: string;
    content: Anthropic.ContentBlockParam[];
    maxTokens?: number;
    effort?: Effort;
    thinking?: "adaptive" | "disabled";
    model?: string;
  },
  handlers: { onThinking?: (t: string) => void; onText?: (t: string) => void },
): Promise<T> {
  const c = getClient();
  const ms = c.messages.stream({
    model: opts.model ?? MODEL,
    max_tokens: opts.maxTokens ?? 12000,
    thinking:
      opts.thinking === "disabled"
        ? { type: "disabled" }
        : { type: "adaptive", display: "summarized" },
    output_config: { effort: opts.effort ?? "low" },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  } as Anthropic.MessageStreamParams);

  for await (const event of ms) {
    if (event.type === "content_block_delta") {
      if (event.delta.type === "thinking_delta") handlers.onThinking?.(event.delta.thinking);
      else if (event.delta.type === "text_delta") handlers.onText?.(event.delta.text);
    }
  }

  const final = await ms.finalMessage();
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("Model returned no output");
  return JSON.parse(extractJson(text)) as T;
}

/**
 * Like runStructured, but streams summarized thinking as it goes so the UI can
 * render Opus's live reasoning trace. Calls handlers as events arrive and
 * returns the validated final object.
 */
export async function runStructuredStreaming<T>(
  opts: {
    system: string;
    content: Anthropic.ContentBlockParam[];
    schema: Record<string, unknown>;
    maxTokens?: number;
    effort?: Effort;
  },
  handlers: {
    onThinking?: (text: string) => void;
    onPhase?: (phase: string) => void;
    onText?: (text: string) => void;
  },
): Promise<T> {
  const c = getClient();
  const ms = c.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: {
      effort: opts.effort ?? "medium",
      format: { type: "json_schema", schema: opts.schema },
    },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  } as Anthropic.MessageStreamParams);

  for await (const event of ms) {
    if (
      event.type === "content_block_start" &&
      event.content_block.type === "text"
    ) {
      handlers.onPhase?.("drafting");
    }
    if (event.type === "content_block_delta") {
      if (event.delta.type === "thinking_delta") {
        handlers.onThinking?.(event.delta.thinking);
      } else if (event.delta.type === "text_delta") {
        handlers.onText?.(event.delta.text);
      }
    }
  }

  const final = await ms.finalMessage();
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new Error("Model returned no structured output");
  return JSON.parse(text) as T;
}
