"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProtocol } from "@/app/providers";
import { composeVisitPlan } from "@/lib/compose";
import { reconcile, reconciliationSummary } from "@/lib/reconcile";
import { getTranscript, loadPatients } from "@/lib/store";
import {
  KindTag,
  Provenance,
  SiteHeader,
  StatusBadge,
} from "@/components/ui";
import type {
  ActionStatus,
  Decision,
  GeneratedNote,
  PlanKind,
  ReconciledAction,
  Transcript,
  TranscriptTurn,
  VisitPlan,
} from "@/lib/types";

type Phase = "previsit" | "invisit" | "postcapture";
type Decisions = Record<string, "accepted" | "overridden">;

const PATIENTS = loadPatients();
const KIND_SECTIONS: { kind: PlanKind; title: string }[] = [
  { kind: "assess", title: "Assess" },
  { kind: "discuss", title: "Discuss" },
  { kind: "order", title: "Order" },
  { kind: "refer", title: "Refer / follow-up" },
];
const STATUS_RANK: Record<ActionStatus, number> = {
  gap: 0,
  new: 1,
  staged: 2,
  addressed: 3,
};

function serialize(turns: TranscriptTurn[]): string {
  return turns.map((t) => `${t.speaker}: ${t.text}`).join("\n\n");
}

function parseTranscript(patientId: string, text: string): Transcript {
  const turns: TranscriptTurn[] = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const m = line.match(/^(Clinician|Patient)\s*:\s*(.*)$/i);
      const speaker = m && /patient/i.test(m[1]) ? "Patient" : "Clinician";
      const txt = m ? m[2] : line;
      return { spanId: `t${i + 1}`, speaker, text: txt } as TranscriptTurn;
    });
  return { patientId, turns };
}

export default function EncounterClient({ patientId }: { patientId: string }) {
  const { protocol, logAdherence } = useProtocol();
  const patient = PATIENTS.find((p) => p.id === patientId);

  const [phase, setPhase] = useState<Phase>("previsit");
  const [transcriptText, setTranscriptText] = useState<string>(() => {
    const seeded = getTranscript(patientId);
    return seeded ? serialize(seeded.turns) : "";
  });
  const [note, setNote] = useState<GeneratedNote | null>(null);
  const [actions, setActions] = useState<ReconciledAction[] | null>(null);
  const [mode, setMode] = useState<"local" | "live" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [signed, setSigned] = useState(false);

  const plan: VisitPlan | null = useMemo(
    () => (patient ? composeVisitPlan(protocol, patient) : null),
    [protocol, patient],
  );

  const decisionMap = useMemo(
    () => Object.fromEntries(protocol.decisions.map((d) => [d.id, d])) as Record<string, Decision>,
    [protocol.decisions],
  );

  const transcript = useMemo(
    () => parseTranscript(patientId, transcriptText),
    [patientId, transcriptText],
  );
  const spanText = useMemo(
    () => Object.fromEntries(transcript.turns.map((t) => [t.spanId, t.text])),
    [transcript],
  );

  if (!patient || !plan) {
    return (
      <>
        <SiteHeader active="care" />
        <main className="mx-auto max-w-[820px] px-6 py-24 text-center">
          <p className="font-display text-2xl text-ink">Patient not found.</p>
          <Link href="/care" className="mt-4 inline-block text-stone underline">
            Back to worklist
          </Link>
        </main>
      </>
    );
  }

  async function runCapture() {
    if (!plan) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Capture failed");
      setNote(data.generatedNote);
      setActions(reconcile(plan, data.addressedExtraction));
      setMode(data.mode);
      setPhase("postcapture");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setLoading(false);
    }
  }

  function decide(action: ReconciledAction, decision: "accepted" | "overridden") {
    setDecisions((prev) => ({ ...prev, [action.id]: decision }));
    logAdherence({
      encounterId: patient!.id,
      actionId: action.id,
      unitId: action.evidence.unitId,
      action: decision,
      at: new Date().toISOString(),
    });
  }

  const goPhase = (p: Phase) => {
    if (p === "postcapture" && !actions) {
      void runCapture();
      return;
    }
    setPhase(p);
  };

  return (
    <>
      <SiteHeader active="care" />
      <main className="mx-auto max-w-[1180px] px-6 pb-28 pt-10">
        {/* Patient header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <Link
              href="/care"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-soft hover:text-stone"
            >
              &larr; Worklist
            </Link>
            <h1 className="mt-2 font-display text-4xl text-ink">{patient.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {patient.demographics.age}y {patient.demographics.sex} ·{" "}
              {patient.problems.join(", ")}
              {patient.goals.length ? ` · Goal: ${patient.goals.join(", ")}` : ""}
            </p>
          </div>
          <div className="text-right font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            <div className="text-stone">{protocol.condition} protocol v{protocol.version}</div>
            <div>advisory · clinician signs</div>
          </div>
        </div>

        {/* Phase stepper */}
        <Stepper phase={phase} onGo={goPhase} loading={loading} hasActions={!!actions} />

        {error && (
          <div className="mt-6 rounded-lg border border-amber/40 bg-amber-bg px-4 py-3 text-sm text-amber">
            {error}
          </div>
        )}

        {/* Phase panels */}
        {phase === "previsit" && (
          <PreVisit plan={plan} decisionMap={decisionMap} onNext={() => setPhase("invisit")} />
        )}

        {phase === "invisit" && (
          <InVisit
            value={transcriptText}
            onChange={setTranscriptText}
            turns={transcript.turns}
            loading={loading}
            onRun={runCapture}
          />
        )}

        {phase === "postcapture" && note && actions && (
          <PostCapture
            note={note}
            actions={actions}
            decisions={decisions}
            decisionMap={decisionMap}
            spanText={spanText}
            mode={mode}
            signed={signed}
            onDecide={decide}
            onSign={() => setSigned(true)}
          />
        )}
      </main>
    </>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({
  phase,
  onGo,
  loading,
  hasActions,
}: {
  phase: Phase;
  onGo: (p: Phase) => void;
  loading: boolean;
  hasActions: boolean;
}) {
  const steps: { id: Phase; n: string; label: string }[] = [
    { id: "previsit", n: "a", label: "Pre-visit plan" },
    { id: "invisit", n: "b", label: "In-visit" },
    { id: "postcapture", n: "c", label: "Post-capture" },
  ];
  return (
    <div className="mt-7 flex items-center gap-2">
      {steps.map((s, i) => {
        const active = phase === s.id;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => onGo(s.id)}
              className={`flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-stone bg-stone text-paper"
                  : "border-line text-ink-muted hover:border-stone-soft"
              }`}
            >
              <span
                className={`font-mono text-[11px] ${active ? "text-paper/70" : "text-stone-soft"}`}
              >
                {s.n}
              </span>
              {s.label}
              {s.id === "postcapture" && loading && (
                <span className="ml-1 animate-pulse text-paper/80">…</span>
              )}
            </button>
            {i < steps.length - 1 && (
              <span className="text-line-strong">———</span>
            )}
          </div>
        );
      })}
      {!hasActions && (
        <span className="ml-3 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted md:inline">
          post-capture runs the live read
        </span>
      )}
    </div>
  );
}

// ── Phase A: Pre-visit plan ─────────────────────────────────────────────────

function PreVisit({
  plan,
  decisionMap,
  onNext,
}: {
  plan: VisitPlan;
  decisionMap: Record<string, Decision>;
  onNext: () => void;
}) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {/* Context */}
        <div className="rounded-2xl border border-line bg-card p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-soft">
            Context summary
          </h2>
          <p className="mt-2 font-display text-lg leading-relaxed text-ink">
            {plan.contextSummary}
          </p>
          {plan.eligibilityFacts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {plan.eligibilityFacts.map((f, i) => (
                <span
                  key={i}
                  className="rounded bg-stone-bg px-1.5 py-0.5 font-mono text-[11px] text-stone"
                >
                  <span className="opacity-60">{f.label}:</span> {f.detail}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Plan items grouped by kind */}
        <div className="mt-6 space-y-7">
          {KIND_SECTIONS.map(({ kind, title }) => {
            const items = plan.items.filter((i) => i.kind === kind);
            if (items.length === 0) return null;
            return (
              <section key={kind}>
                <div className="mb-3 flex items-center gap-3">
                  <KindTag kind={kind} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-line bg-card p-5"
                    >
                      <p className="font-display text-lg text-ink">{item.content}</p>
                      <p className="mt-1 text-sm text-ink-muted">{item.rationale}</p>
                      <Provenance
                        facts={item.triggeringFacts}
                        sourceRef={item.sourceRef}
                        decision={
                          item.decisionRef && decisionMap[item.decisionRef]
                            ? {
                                question: decisionMap[item.decisionRef].question,
                                chosen: decisionMap[item.decisionRef].chosen,
                              }
                            : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Note scaffold preview */}
      <aside className="lg:col-span-1">
        <div className="sticky top-24 rounded-2xl border border-line bg-paper-deep/40 p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-soft">
            Note scaffold
          </h2>
          <ul className="mt-3 space-y-3">
            {plan.noteScaffold.map((s) => (
              <li key={s.unitId}>
                <p className="font-display text-base text-ink">{s.key}</p>
                <p className="text-[13px] leading-snug text-ink-muted">{s.prompt}</p>
              </li>
            ))}
          </ul>
          <button
            onClick={onNext}
            className="mt-6 w-full rounded-full bg-stone py-3 text-sm font-medium text-paper transition-colors hover:bg-stone-deep"
          >
            Enter the visit &rarr;
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── Phase B: In-visit transcript ─────────────────────────────────────────────

function InVisit({
  value,
  onChange,
  turns,
  loading,
  onRun,
}: {
  value: string;
  onChange: (v: string) => void;
  turns: TranscriptTurn[];
  loading: boolean;
  onRun: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-soft">
            Visit transcript
          </h2>
          <button
            onClick={() => setEditing((e) => !e)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted hover:text-stone"
          >
            {editing ? "Done editing" : "Edit transcript"}
          </button>
        </div>

        {editing ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            className="h-[460px] w-full resize-none rounded-xl border border-line bg-card p-4 font-mono text-[13px] leading-relaxed text-ink outline-none focus:border-stone-soft"
          />
        ) : (
          <div className="space-y-3 rounded-xl border border-line bg-card p-5">
            {turns.map((t) => (
              <div key={t.spanId} className="flex gap-3">
                <span className="mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-soft">
                  {t.spanId}
                </span>
                <p className="text-[15px] leading-relaxed text-ink">
                  <span
                    className={`mr-1.5 font-medium ${
                      t.speaker === "Clinician" ? "text-stone" : "text-ink-muted"
                    }`}
                  >
                    {t.speaker}:
                  </span>
                  {t.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="lg:col-span-1">
        <div className="sticky top-24 rounded-2xl border border-line bg-paper-deep/40 p-6">
          <p className="text-sm leading-relaxed text-ink-muted">
            The transcript stands in for the visit conversation. Capturing it runs
            a structured read against the pre-visit plan — generating the note and
            reconciling what was planned against what actually happened.
          </p>
          <button
            onClick={onRun}
            disabled={loading}
            className="mt-6 w-full rounded-full bg-stone py-3 text-sm font-medium text-paper transition-colors hover:bg-stone-deep disabled:opacity-60"
          >
            {loading ? "Reading the visit…" : "Capture & reconcile →"}
          </button>
        </div>
      </aside>
    </div>
  );
}

// ── Phase C: Post-capture (note + reconciliation) ────────────────────────────

function PostCapture({
  note,
  actions,
  decisions,
  decisionMap,
  spanText,
  mode,
  signed,
  onDecide,
  onSign,
}: {
  note: GeneratedNote;
  actions: ReconciledAction[];
  decisions: Decisions;
  decisionMap: Record<string, Decision>;
  spanText: Record<string, string>;
  mode: "local" | "live" | null;
  signed: boolean;
  onDecide: (a: ReconciledAction, d: "accepted" | "overridden") => void;
  onSign: () => void;
}) {
  const summary = reconciliationSummary(actions);
  const sorted = [...actions].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
  const decidedCount = Object.keys(decisions).length;

  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-5">
      {/* Reconciled actions */}
      <div className="lg:col-span-3">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl text-ink">Reconciled actions</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
            {summary.gap ?? 0} gap · {summary.new ?? 0} new · {summary.staged ?? 0} staged ·{" "}
            {summary.addressed ?? 0} addressed
          </span>
        </div>

        <div className="space-y-3">
          {sorted.map((a) => {
            const d = decisions[a.id];
            const dec = a.decisionRef ? decisionMap[a.decisionRef] : undefined;
            return (
              <div
                key={a.id}
                className={`rounded-xl border bg-card p-5 ${
                  a.status === "gap" ? "border-amber/45" : "border-line"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      {a.kind && <KindTag kind={a.kind} />}
                    </div>
                    <p className="font-display text-lg text-ink">{a.content}</p>
                    {a.status === "gap" && (
                      <p className="mt-1 text-sm text-amber">
                        Planned but not addressed in the visit.
                      </p>
                    )}
                    {a.rationale && a.status !== "gap" && (
                      <p className="mt-1 text-sm text-ink-muted">{a.rationale}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <DecisionButton
                      label="Accept"
                      active={d === "accepted"}
                      tone="accept"
                      onClick={() => onDecide(a, "accepted")}
                    />
                    <DecisionButton
                      label="Override"
                      active={d === "overridden"}
                      tone="override"
                      onClick={() => onDecide(a, "overridden")}
                    />
                  </div>
                </div>

                <Provenance
                  facts={a.evidence.triggeringFacts}
                  sourceRef={a.sourceRef}
                  decision={
                    dec ? { question: dec.question, chosen: dec.chosen } : undefined
                  }
                />
                {a.evidence.transcriptSpanId && (
                  <p
                    className="mt-2 font-mono text-[11px] text-ink-muted"
                    title={spanText[a.evidence.transcriptSpanId]}
                  >
                    <span className="uppercase tracking-[0.12em] text-stone-soft">
                      Heard at {a.evidence.transcriptSpanId} ·{" "}
                    </span>
                    &ldquo;{spanText[a.evidence.transcriptSpanId]}&rdquo;
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Generated note + sign */}
      <aside className="lg:col-span-2">
        <div className="sticky top-24 space-y-4">
          <div className="rounded-2xl border border-line bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-soft">
                Generated note
              </h2>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-soft">
                {mode === "live" ? "Opus 4.8 · live" : "deterministic"}
              </span>
            </div>
            <div className="space-y-4">
              {note.sections.map((s) => (
                <div key={s.key}>
                  <p className="font-display text-base text-ink">{s.key}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                    {s.content}
                  </p>
                  {s.citations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.citations.map((c, i) => (
                        <span
                          key={i}
                          title={spanText[c.transcriptSpanId]}
                          className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] text-stone-soft"
                        >
                          {c.transcriptSpanId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-paper-deep/40 p-6">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              <span>Adherence</span>
              <span>
                {decidedCount}/{actions.length} acted
              </span>
            </div>
            {signed ? (
              <div className="mt-4 rounded-lg border border-moss/40 bg-moss-bg px-4 py-3 text-sm text-moss">
                Encounter signed (mock). Nothing was auto-committed.
              </div>
            ) : (
              <button
                onClick={onSign}
                className="mt-4 w-full rounded-full bg-stone py-3 text-sm font-medium text-paper transition-colors hover:bg-stone-deep"
              >
                Sign encounter (mock)
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DecisionButton({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "accept" | "override";
  onClick: () => void;
}) {
  const activeCls =
    tone === "accept"
      ? "border-moss bg-moss-bg text-moss"
      : "border-amber bg-amber-bg text-amber";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
        active ? activeCls : "border-line text-ink-muted hover:border-stone-soft"
      }`}
    >
      {label}
    </button>
  );
}
