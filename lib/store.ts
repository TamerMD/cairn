// ── Protocol store ────────────────────────────────────────────────────────────
// Pure helpers over the seeded JSON. No database, no server-only APIs: usable
// from the vitest suite (node) and from the client ProtocolProvider alike. The
// live app holds protocol state client-side (robust on stateless serverless);
// these functions seed it and perform versioned edits that drive propagation.

import protocolSeed from "@/data/pcos-protocol.seed.json";
import patientsSeed from "@/data/patients.seed.json";
import transcriptsSeed from "@/data/transcripts.seed.json";
import type {
  Patient,
  Protocol,
  ProtocolUnit,
  Transcript,
} from "@/lib/types";

export function loadSeedProtocol(): Protocol {
  return structuredClone(protocolSeed) as unknown as Protocol;
}

export function loadPatients(): Patient[] {
  return structuredClone(patientsSeed) as unknown as Patient[];
}

export function loadTranscripts(): Transcript[] {
  return structuredClone(transcriptsSeed) as unknown as Transcript[];
}

export function getTranscript(patientId: string): Transcript | undefined {
  return loadTranscripts().find((t) => t.patientId === patientId);
}

export function getPatient(patientId: string): Patient | undefined {
  return loadPatients().find((p) => p.id === patientId);
}

/**
 * Edit one protocol unit and bump versions — the propagation primitive.
 * Returns a NEW protocol (immutable); both the unit's version and the
 * protocol's version increment so downstream composition reflects the change.
 */
export function updateUnit(
  protocol: Protocol,
  unitId: string,
  patch: Partial<Omit<ProtocolUnit, "id" | "version">>,
): Protocol {
  const units = protocol.units.map((u) =>
    u.id === unitId ? { ...u, ...patch, id: u.id, version: u.version + 1 } : u,
  );
  return { ...protocol, version: protocol.version + 1, units };
}

/** Merge authored/compiled units into the protocol (replace by id, append new). */
export function upsertUnits(
  protocol: Protocol,
  incoming: ProtocolUnit[],
): Protocol {
  const byId = new Map(protocol.units.map((u) => [u.id, u]));
  for (const u of incoming) byId.set(u.id, u);
  return {
    ...protocol,
    version: protocol.version + 1,
    units: Array.from(byId.values()),
  };
}

/** Find a unit by id. */
export function findUnit(
  protocol: Protocol,
  unitId: string,
): ProtocolUnit | undefined {
  return protocol.units.find((u) => u.id === unitId);
}
