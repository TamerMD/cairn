"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  loadSeedProtocol,
  updateUnit as storeUpdateUnit,
  upsertUnits as storeUpsertUnits,
} from "@/lib/store";
import type { AdherenceEvent, Protocol, ProtocolUnit } from "@/lib/types";

const STORAGE_KEY = "cairn.protocol.v1";
const ADHERENCE_KEY = "cairn.adherence.v1";

type UnitPatch = Partial<Omit<ProtocolUnit, "id" | "version">>;

interface ProtocolContextValue {
  protocol: Protocol;
  adherence: AdherenceEvent[];
  hydrated: boolean;
  updateUnit: (unitId: string, patch: UnitPatch) => void;
  upsertUnits: (units: ProtocolUnit[]) => void;
  replaceProtocol: (p: Protocol) => void;
  resetProtocol: () => void;
  logAdherence: (e: AdherenceEvent) => void;
}

const ProtocolContext = createContext<ProtocolContextValue | null>(null);

export function ProtocolProvider({ children }: { children: React.ReactNode }) {
  // Seed is deterministic → identical on server and first client render (no
  // hydration mismatch). localStorage overrides are applied after mount.
  const [protocol, setProtocol] = useState<Protocol>(() => loadSeedProtocol());
  const [adherence, setAdherence] = useState<AdherenceEvent[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const p = localStorage.getItem(STORAGE_KEY);
      if (p) setProtocol(JSON.parse(p) as Protocol);
      const a = localStorage.getItem(ADHERENCE_KEY);
      if (a) setAdherence(JSON.parse(a) as AdherenceEvent[]);
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(protocol));
    } catch {
      /* ignore quota */
    }
  }, [protocol, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(ADHERENCE_KEY, JSON.stringify(adherence));
    } catch {
      /* ignore quota */
    }
  }, [adherence, hydrated]);

  const updateUnit = useCallback((unitId: string, patch: UnitPatch) => {
    setProtocol((prev) => storeUpdateUnit(prev, unitId, patch));
  }, []);

  const upsertUnits = useCallback((units: ProtocolUnit[]) => {
    setProtocol((prev) => storeUpsertUnits(prev, units));
  }, []);

  const replaceProtocol = useCallback((p: Protocol) => setProtocol(p), []);

  const resetProtocol = useCallback(() => {
    setProtocol(loadSeedProtocol());
    setAdherence([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ADHERENCE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const logAdherence = useCallback((e: AdherenceEvent) => {
    setAdherence((prev) => {
      const rest = prev.filter(
        (x) => !(x.encounterId === e.encounterId && x.actionId === e.actionId),
      );
      return [...rest, e];
    });
  }, []);

  return (
    <ProtocolContext.Provider
      value={{
        protocol,
        adherence,
        hydrated,
        updateUnit,
        upsertUnits,
        replaceProtocol,
        resetProtocol,
        logAdherence,
      }}
    >
      {children}
    </ProtocolContext.Provider>
  );
}

export function useProtocol(): ProtocolContextValue {
  const ctx = useContext(ProtocolContext);
  if (!ctx) throw new Error("useProtocol must be used within ProtocolProvider");
  return ctx;
}
