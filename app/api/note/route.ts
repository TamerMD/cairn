// ── POST /api/note ────────────────────────────────────────────────────────────
// Post-capture: given the visit plan + the in-visit transcript, return a note
// structured to the protocol's scaffold AND a structured read of what the
// transcript addressed (drives deterministic reconciliation client-side).
//
// Phase 2: deterministic engine. Phase 3 upgrades this to call Opus 4.8 live and
// falls back to the deterministic engine if the key is missing or a call fails.

import { localExtraction, localNote } from "@/lib/localExtract";
import type { Transcript, VisitPlan } from "@/lib/types";

export async function POST(request: Request) {
  let body: { plan?: VisitPlan; transcript?: Transcript };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan, transcript } = body;
  if (!plan || !transcript) {
    return Response.json(
      { error: "Missing plan or transcript" },
      { status: 400 },
    );
  }

  const generatedNote = localNote(plan, transcript);
  const addressedExtraction = localExtraction(plan, transcript);

  return Response.json({
    mode: "local",
    generatedNote,
    addressedExtraction,
  });
}
