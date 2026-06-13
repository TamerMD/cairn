// ── POST /api/note ────────────────────────────────────────────────────────────
// Post-capture: given the visit plan + the in-visit transcript, return a note
// structured to the protocol's scaffold AND a structured read of what the
// transcript addressed (client runs deterministic reconcile() over it).
//
// Runs live on Opus 4.8 when a key is present; falls back to the deterministic
// engine (the stage parachute) on missing key or any error.

import { hasApiKey, runStructured } from "@/lib/anthropic";
import { NOTE_SCHEMA } from "@/lib/schemas";
import { localExtraction, localNote } from "@/lib/localExtract";
import type {
  AddressedExtraction,
  GeneratedNote,
  Transcript,
  VisitPlan,
} from "@/lib/types";

export const maxDuration = 300;

const SYSTEM = `You are Cairn's post-visit clinical scribe.
You are given a pre-visit plan (the indicated actions, each with an id) and the visit transcript.
1) Generate a note structured to EXACTLY the provided note-scaffold section keys. Write each section only from what the transcript supports, and cite the transcript span ids you used. If a section was not addressed in the visit, say so plainly.
2) Reconcile plan vs. transcript: list the plan item ids the transcript actually addressed (with the span id that shows it), and any NEW items raised in the visit that were not in the plan. Do not mark an item addressed unless the transcript supports it.
Never invent content or evidence. You operationalize the org's protocol; you do not give medical advice.`;

interface NoteBody {
  plan?: VisitPlan;
  transcript?: Transcript;
}

interface OpusNote {
  generatedNote: GeneratedNote;
  addressedExtraction: {
    addressedPlanItemIds: string[];
    evidenceByItem: { itemId: string; transcriptSpanId: string }[];
    newItems: { content: string; evidenceSpanId: string; rationale: string }[];
  };
}

export async function POST(request: Request) {
  let body: NoteBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { plan, transcript } = body;
  if (!plan || !transcript) {
    return Response.json({ error: "Missing plan or transcript" }, { status: 400 });
  }

  if (hasApiKey()) {
    try {
      const planText = plan.items
        .map((i) => `- ${i.id} [${i.kind}]: ${i.content}`)
        .join("\n");
      const scaffold = plan.noteScaffold
        .map((s) => `- ${s.key}: ${s.prompt}`)
        .join("\n");
      const turns = transcript.turns
        .map((t) => `${t.spanId} ${t.speaker}: ${t.text}`)
        .join("\n");

      const result = await runStructured<OpusNote>({
        system: SYSTEM,
        content: [
          {
            type: "text",
            text: `PRE-VISIT PLAN (item id [kind]: action):\n${planText}\n\nNOTE SCAFFOLD (section key: prompt):\n${scaffold}\n\nTRANSCRIPT (spanId Speaker: text):\n${turns}\n\nReturn JSON per schema. Use the exact plan item ids and the exact scaffold section keys.`,
          },
        ],
        schemaName: "note_and_reconciliation",
        schema: NOTE_SCHEMA,
        maxTokens: 16000,
        effort: "high",
      });

      const evidenceByItem: Record<string, string> = {};
      for (const e of result.addressedExtraction.evidenceByItem) {
        evidenceByItem[e.itemId] = e.transcriptSpanId;
      }
      const addressedExtraction: AddressedExtraction = {
        addressedPlanItemIds: result.addressedExtraction.addressedPlanItemIds,
        evidenceByItem,
        newItems: result.addressedExtraction.newItems,
      };

      return Response.json({
        mode: "live",
        generatedNote: result.generatedNote,
        addressedExtraction,
      });
    } catch {
      // fall through to deterministic engine
    }
  }

  return Response.json({
    mode: "local",
    generatedNote: localNote(plan, transcript),
    addressedExtraction: localExtraction(plan, transcript),
  });
}
