"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useProtocol } from "@/app/providers";
import { composeVisitPlan } from "@/lib/compose";
import { reconcile } from "@/lib/reconcile";
import { getTranscript, loadPatients } from "@/lib/store";
import { KindTag, Provenance, SiteHeader, StatusBadge, kindDot } from "@/components/ui";
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

const PATIENTS = loadPatients();
const KIND_SECTIONS: { kind: PlanKind; title: string }[] = [
  { kind: "assess", title: "Assess" },
  { kind: "discuss", title: "Discuss" },
  { kind: "order", title: "Order" },
  { kind: "refer", title: "Refer / follow-up" },
];

// Situation-specific verbs (the same two words shouldn't mean three things).
const VERBS: Record<ActionStatus, { accept: string; reject: string; defer?: string }> = {
  gap: { accept: "Order now", reject: "Not indicated", defer: "Defer" },
  new: { accept: "Add to plan", reject: "Dismiss" },
  staged: { accept: "Approve", reject: "Cancel" },
  addressed: { accept: "Confirm", reject: "Reopen" },
};
const ACCEPT_VERBS = new Set(["Order now", "Add to plan", "Approve", "Confirm"]);

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
      return { spanId: `t${i + 1}`, speaker, text: m ? m[2] : line } as TranscriptTurn;
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
  const [decided, setDecided] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState(false);

  const plan: VisitPlan | null = useMemo(
    () => (patient ? composeVisitPlan(protocol, patient) : null),
    [protocol, patient],
  );
  const decisionMap = useMemo(
    () =>
      Object.fromEntries(protocol.decisions.map((d) => [d.id, d])) as Record<
        string,
        Decision
      >,
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

  function decide(action: ReconciledAction, verb: string) {
    setDecided((prev) => ({ ...prev, [action.id]: verb }));
    logAdherence({
      encounterId: patient!.id,
      actionId: action.id,
      unitId: action.evidence.unitId,
      action: ACCEPT_VERBS.has(verb) ? "accepted" : "overridden",
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

      {/* Sticky orientation bar — patient + phase nav survive scroll */}
      <div className="sticky top-[57px] z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-baseline gap-3">
            <Link
              href="/care"
              className="text-stone-soft hover:text-stone"
              aria-label="Back to worklist"
            >
              ←
            </Link>
            <span className="font-display text-xl text-ink">{patient.name}</span>
            <span className="text-[13px] text-ink-muted">
              {patient.demographics.age}y {patient.demographics.sex} ·{" "}
              {patient.problems.join(", ")}
              {patient.goals.length ? ` · Goal: ${patient.goals.join(", ")}` : ""}
            </span>
          </div>
          <Stepper phase={phase} onGo={goPhase} loading={loading} hasActions={!!actions} />
        </div>
      </div>

      <main className="mx-auto max-w-[1180px] px-6 pb-28 pt-7">
        {error && (
          <div className="mb-6 rounded-lg border border-flag/40 bg-flag-bg px-4 py-3 text-sm text-flag">
            {error}
          </div>
        )}

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
            decided={decided}
            decisionMap={decisionMap}
            spanText={spanText}
            mode={mode}
            signed={signed}
            onDecide={decide}
            onApproveAllStaged={(list) => list.forEach((a) => decide(a, "Approve"))}
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
  const steps: { id: Phase; label: string }[] = [
    { id: "previsit", label: "Pre-visit" },
    { id: "invisit", label: "In-visit" },
    { id: "postcapture", label: "Post-capture" },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s) => {
        const active = phase === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onGo(s.id)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-stone text-paper"
                : "text-ink-muted hover:bg-card hover:text-stone"
            }`}
          >
            {s.label}
            {s.id === "postcapture" && loading && (
              <span className="ml-1 animate-pulse">…</span>
            )}
            {s.id === "postcapture" && hasActions && !loading && (
              <span className={active ? "ml-1 text-paper/70" : "ml-1 text-stone-soft"}>✓</span>
            )}
          </button>
        );
      })}
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
  const counts = KIND_SECTIONS.map(({ kind, title }) => ({
    kind,
    title,
    n: plan.items.filter((i) => i.kind === kind).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {/* One-glance plan bar (color-coded, jump links) */}
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-3">
          <span className="text-[13px] font-semibold text-ink">Visit plan</span>
          <span className="text-ink-muted">·</span>
          {counts.map((c) => (
            <a
              key={c.kind}
              href={`#k-${c.kind}`}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              <span className={`h-2 w-2 rounded-full ${kindDot(c.kind)}`} />
              {c.title} {c.n}
            </a>
          ))}
        </div>

        {/* Context */}
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-[13px] font-semibold text-stone">Context</p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink">
            {plan.contextSummary}
          </p>
          {plan.eligibilityFacts.filter((f) => f.fact !== "problems").length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.eligibilityFacts
                .filter((f) => f.fact !== "problems")
                .map((f, i) => (
                  <span
                    key={i}
                    className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[11px] text-ink"
                  >
                    <span className="text-ink-muted">{f.label}:</span> {f.detail}
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* Plan items grouped by kind — dense cards */}
        <div className="mt-6 space-y-7">
          {KIND_SECTIONS.map(({ kind, title }) => {
            const items = plan.items.filter((i) => i.kind === kind);
            if (items.length === 0) return null;
            return (
              <section key={kind} id={`k-${kind}`} className="scroll-mt-32">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${kindDot(kind)}`} />
                  <h3 className="text-sm font-semibold text-ink">{title}</h3>
                  <span className="text-[12px] text-ink-muted">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-line bg-card px-4 py-3"
                    >
                      <p className="text-[15px] font-medium text-ink">{item.content}</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
                        {item.rationale}
                      </p>
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

      {/* Note scaffold sidebar */}
      <aside className="lg:col-span-1">
        <div className="sticky top-32 rounded-2xl border border-line bg-paper-deep/40 p-6">
          <p className="text-[13px] font-semibold text-stone">Note scaffold</p>
          <ul className="mt-3 space-y-3">
            {plan.noteScaffold.map((s) => (
              <li key={s.unitId}>
                <p className="text-[15px] font-medium text-ink">{s.key}</p>
                <p className="text-[13px] leading-snug text-ink-muted">{s.prompt}</p>
              </li>
            ))}
          </ul>
          <button
            onClick={onNext}
            className="mt-6 w-full rounded-full bg-stone py-3 text-sm font-medium text-paper transition-colors hover:bg-stone-deep"
          >
            Enter the visit →
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Visit transcript</h2>
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-[13px] text-ink-muted hover:text-stone"
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
                <span className="mt-1 shrink-0 font-mono text-[10px] text-stone-soft">
                  {t.spanId}
                </span>
                <p className="text-[15px] leading-relaxed text-ink">
                  <span
                    className={`mr-1.5 font-semibold ${
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
        <div className="sticky top-32 rounded-2xl border border-line bg-paper-deep/40 p-6">
          <p className="text-sm leading-relaxed text-ink-muted">
            The transcript stands in for the visit. Capturing it generates the note
            and reconciles the plan against what actually happened.
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

// ── Phase C: Post-capture ─────────────────────────────────────────────────────

function PostCapture({
  note,
  actions,
  decided,
  decisionMap,
  spanText,
  mode,
  signed,
  onDecide,
  onApproveAllStaged,
  onSign,
}: {
  note: GeneratedNote;
  actions: ReconciledAction[];
  decided: Record<string, string>;
  decisionMap: Record<string, Decision>;
  spanText: Record<string, string>;
  mode: "local" | "live" | null;
  signed: boolean;
  onDecide: (a: ReconciledAction, verb: string) => void;
  onApproveAllStaged: (list: ReconciledAction[]) => void;
  onSign: () => void;
}) {
  const gaps = actions.filter((a) => a.status === "gap");
  const news = actions.filter((a) => a.status === "new");
  const staged = actions.filter((a) => a.status === "staged");
  const addressed = actions.filter((a) => a.status === "addressed");
  const [showAddressed, setShowAddressed] = useState(false);

  const needsDecision = [...gaps, ...news, ...staged];
  const made = needsDecision.filter((a) => decided[a.id]).length;
  const gapsUnresolved = gaps.filter((a) => !decided[a.id]).length;
  const stagedPending = staged.filter((a) => !decided[a.id]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
      <div className="lg:col-span-3">
        {/* Live summary strip */}
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-[13px]">
          <Pill loud={gaps.length > 0} cls="bg-flag-bg text-flag" dot="bg-flag" label={`${gaps.length} gap${gaps.length === 1 ? "" : "s"}`} />
          <Pill cls="bg-stone-bg text-stone" dot="bg-stone" label={`${news.length} new`} />
          <Pill cls="bg-slate-bg text-slate" dot="bg-slate" label={`${staged.length} staged`} />
          <Pill cls="bg-moss-bg text-moss" dot="bg-moss" label={`${addressed.length} addressed`} />
          <span className="ml-auto font-medium text-ink-muted">
            {made}/{needsDecision.length} decisions made
          </span>
        </div>

        {/* Needs your decision — spotlight gaps + new */}
        {(gaps.length > 0 || news.length > 0) && (
          <section className="mb-7">
            <h2 className="mb-2.5 text-sm font-semibold text-ink">Needs your decision</h2>
            <div className="space-y-2.5">
              {[...gaps, ...news].map((a) => (
                <ActionCard
                  key={a.id}
                  action={a}
                  decided={decided[a.id]}
                  decisionMap={decisionMap}
                  spanText={spanText}
                  onDecide={onDecide}
                />
              ))}
            </div>
          </section>
        )}

        {/* Staged for sign-off */}
        {staged.length > 0 && (
          <section className="mb-7">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">
                Staged for sign-off
                <span className="ml-2 font-normal text-ink-muted">
                  orders & referrals queued from the plan
                </span>
              </h2>
              {stagedPending.length > 0 && (
                <button
                  onClick={() => onApproveAllStaged(stagedPending)}
                  className="rounded-full border border-slate/40 px-3 py-1 text-[12px] font-medium text-slate hover:bg-slate-bg"
                >
                  Approve all ({stagedPending.length})
                </button>
              )}
            </div>
            <div className="space-y-2">
              {staged.map((a) => (
                <StagedRow
                  key={a.id}
                  action={a}
                  decided={decided[a.id]}
                  onDecide={onDecide}
                />
              ))}
            </div>
          </section>
        )}

        {/* Addressed — collapsed checklist */}
        {addressed.length > 0 && (
          <section>
            <button
              onClick={() => setShowAddressed((s) => !s)}
              className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"
            >
              <span className="text-moss">✓</span>
              {addressed.length} addressed in the visit
              <span className="text-[12px] font-normal text-ink-muted">
                {showAddressed ? "hide" : "show"}
              </span>
            </button>
            {showAddressed && (
              <ul className="space-y-1 rounded-xl border border-line bg-card p-4">
                {addressed.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-baseline gap-2 text-[14px] text-ink"
                  >
                    <span className="text-moss">✓</span>
                    <span>{a.content}</span>
                    {a.evidence.transcriptSpanId && (
                      <span
                        className="font-mono text-[11px] text-stone-soft"
                        title={spanText[a.evidence.transcriptSpanId]}
                      >
                        · heard at {a.evidence.transcriptSpanId}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Note + guarded sign */}
      <aside className="lg:col-span-2">
        <div className="sticky top-32 space-y-4">
          <div className="rounded-2xl border border-line bg-card p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-stone">Generated note</p>
              <span className="rounded-full bg-paper-deep px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-soft">
                {mode === "live" ? "Opus 4.8 · live" : "deterministic"}
              </span>
            </div>
            <div className="space-y-4">
              {note.sections.map((s) => (
                <div key={s.key}>
                  <p className="text-[15px] font-medium text-ink">{s.key}</p>
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
            {signed ? (
              <div className="rounded-lg border border-moss/40 bg-moss-bg px-4 py-3 text-sm text-moss">
                Encounter signed (mock). Nothing was auto-committed.
              </div>
            ) : (
              <>
                <button
                  onClick={onSign}
                  disabled={gapsUnresolved > 0}
                  className="w-full rounded-full bg-stone py-3 text-sm font-medium text-paper transition-colors hover:bg-stone-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sign encounter (mock)
                </button>
                {gapsUnresolved > 0 && (
                  <p className="mt-2 text-center text-[13px] font-medium text-flag">
                    {gapsUnresolved} gap{gapsUnresolved === 1 ? "" : "s"} unresolved
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Pill({
  cls,
  dot,
  label,
  loud,
}: {
  cls: string;
  dot: string;
  label: string;
  loud?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${cls} ${loud ? "ring-1 ring-flag/40" : ""}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function ActionCard({
  action,
  decided,
  decisionMap,
  spanText,
  onDecide,
}: {
  action: ReconciledAction;
  decided?: string;
  decisionMap: Record<string, Decision>;
  spanText: Record<string, string>;
  onDecide: (a: ReconciledAction, verb: string) => void;
}) {
  const v = VERBS[action.status];
  const dec = action.decisionRef ? decisionMap[action.decisionRef] : undefined;
  const isGap = action.status === "gap";
  return (
    <div
      className={`rounded-lg border bg-card px-4 py-3 ${
        isGap ? "border-flag/45" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <StatusBadge status={action.status} />
            {action.kind && <KindTag kind={action.kind} />}
          </div>
          <p className="text-[15px] font-medium text-ink">{action.content}</p>
          {isGap ? (
            <p className="mt-0.5 text-[13px] text-flag">
              Planned but not addressed in the visit.
            </p>
          ) : (
            action.rationale && (
              <p className="mt-0.5 text-[13px] text-ink-muted">{action.rationale}</p>
            )
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <VerbButton
              label={v.accept}
              tone="accept"
              active={decided === v.accept}
              onClick={() => onDecide(action, v.accept)}
            />
            {v.defer && (
              <VerbButton
                label={v.defer}
                tone="neutral"
                active={decided === v.defer}
                onClick={() => onDecide(action, v.defer!)}
              />
            )}
            <VerbButton
              label={v.reject}
              tone="reject"
              active={decided === v.reject}
              onClick={() => onDecide(action, v.reject)}
            />
          </div>
        </div>
      </div>
      <Provenance
        facts={action.evidence.triggeringFacts}
        sourceRef={action.sourceRef}
        decision={dec ? { question: dec.question, chosen: dec.chosen } : undefined}
      />
      {action.evidence.transcriptSpanId && (
        <p
          className="mt-1.5 font-mono text-[11px] text-stone-soft"
          title={spanText[action.evidence.transcriptSpanId]}
        >
          heard at {action.evidence.transcriptSpanId}
        </p>
      )}
    </div>
  );
}

function StagedRow({
  action,
  decided,
  onDecide,
}: {
  action: ReconciledAction;
  decided?: string;
  onDecide: (a: ReconciledAction, verb: string) => void;
}) {
  const v = VERBS.staged;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-card px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {action.kind && <KindTag kind={action.kind} />}
        <span className="truncate text-[14px] text-ink">{action.content}</span>
      </div>
      {decided ? (
        <span
          className={`shrink-0 text-[12px] font-semibold ${
            decided === v.accept ? "text-moss" : "text-ink-muted"
          }`}
        >
          {decided === v.accept ? "✓ Approved" : "Cancelled"}
        </span>
      ) : (
        <div className="flex shrink-0 gap-1.5">
          <VerbButton label={v.accept} tone="accept" onClick={() => onDecide(action, v.accept)} />
          <VerbButton label={v.reject} tone="reject" onClick={() => onDecide(action, v.reject)} />
        </div>
      )}
    </div>
  );
}

function VerbButton({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone: "accept" | "reject" | "neutral";
  active?: boolean;
  onClick: () => void;
}) {
  const activeCls =
    tone === "accept"
      ? "border-moss bg-moss-bg text-moss"
      : tone === "reject"
        ? "border-flag bg-flag-bg text-flag"
        : "border-stone-soft bg-stone-bg text-stone";
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active ? activeCls : "border-line text-ink-muted hover:border-stone-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
