"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProtocol } from "@/app/providers";
import { SiteHeader } from "@/components/ui";
import type { Protocol } from "@/lib/types";

type Stage = "upload" | "review" | "interview" | "compiling" | "done";

interface ForkOption {
  label: string;
  sourceCitation: string;
  sourceQuote: string;
}
interface Fork {
  id: string;
  question: string;
  tension: string;
  recommendedLabel: string;
  options: ForkOption[];
}
interface CandidateUnit {
  title: string;
  type: string;
  rationale: string;
  sourceQuote: string;
  sourceLocator: string;
}
interface IngestResult {
  sources: { name: string }[];
  candidateUnits: CandidateUnit[];
  forks: Fork[];
}
interface Decision {
  forkId: string;
  question: string;
  chosenLabel: string;
  options: ForkOption[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function AuthorClient() {
  const { replaceProtocol, protocol } = useProtocol();
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [trace, setTrace] = useState("");
  const [phase, setPhase] = useState<"reading" | "drafting">("reading");
  const [discoveries, setDiscoveries] = useState<string[]>([]);
  const draftBuf = useRef("");
  const seen = useRef<Set<string>>(new Set());
  const [forkIndex, setForkIndex] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [turnMsg, setTurnMsg] = useState<string>("");
  const [turnLoading, setTurnLoading] = useState(false);
  const [authored, setAuthored] = useState<Protocol | null>(null);

  async function runIngest() {
    setBusy(true);
    setError(null);
    setTrace("");
    setPhase("reading");
    setDiscoveries([]);
    draftBuf.current = "";
    seen.current = new Set();
    try {
      const pdfs = await Promise.all(
        files.map(async (f) => ({ name: f.name, base64: await fileToBase64(f) })),
      );
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pdfs, notes, condition: "PCOS" }),
      });

      // Non-streaming error (e.g. missing key) comes back as JSON.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Ingestion failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let result: IngestResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "thinking") setTrace((t) => t + evt.text);
          else if (evt.type === "phase") setPhase("drafting");
          else if (evt.type === "draft") {
            // Surface structured items as their JSON strings complete.
            draftBuf.current += evt.text;
            const re = /"(question|label|title)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
            const found: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(draftBuf.current))) {
              const key = m[1];
              const val = m[2].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
              const tag = `${key}:${val}`;
              if (val && !seen.current.has(tag)) {
                seen.current.add(tag);
                const prefix =
                  key === "question"
                    ? "Decision fork"
                    : key === "label"
                      ? "Option"
                      : "Candidate unit";
                found.push(`${prefix} — ${val}`);
              }
            }
            if (found.length) setDiscoveries((d) => [...d, ...found]);
          } else if (evt.type === "error") throw new Error(evt.error);
          else if (evt.type === "result") result = evt.result as IngestResult;
        }
      }

      if (!result) throw new Error("No result returned");
      setIngest(result);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingestion failed");
    } finally {
      setBusy(false);
    }
  }

  // Fetch the grounded interview turn whenever we land on a new fork.
  const fetchedFor = useRef<string>("");
  useEffect(() => {
    if (stage !== "interview" || !ingest) return;
    const fork = ingest.forks[forkIndex];
    if (!fork || fetchedFor.current === fork.id) return;
    fetchedFor.current = fork.id;
    setTurnLoading(true);
    setTurnMsg("");
    fetch("/api/interview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fork,
        priorAnswers: decisions.map((d) => ({
          question: d.question,
          chosenLabel: d.chosenLabel,
        })),
      }),
    })
      .then((r) => r.json())
      .then((d) => setTurnMsg(d.assistantMessage ?? fork.question))
      .catch(() => setTurnMsg(fork.question))
      .finally(() => setTurnLoading(false));
  }, [stage, forkIndex, ingest, decisions]);

  const chooseOption = useCallback(
    (opt: ForkOption) => {
      if (!ingest) return;
      const fork = ingest.forks[forkIndex];
      const next = [
        ...decisions,
        {
          forkId: fork.id,
          question: fork.question,
          chosenLabel: opt.label,
          options: fork.options,
        },
      ];
      setDecisions(next);
      if (forkIndex + 1 < ingest.forks.length) {
        setForkIndex(forkIndex + 1);
      } else {
        void compile(next);
      }
    },
    [ingest, forkIndex, decisions],
  );

  async function compile(finalDecisions: Decision[]) {
    setStage("compiling");
    setError(null);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: finalDecisions,
          candidateUnits: ingest?.candidateUnits ?? [],
          sources: ingest?.sources ?? [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Compile failed");
      replaceProtocol(data.protocol as Protocol);
      setAuthored(data.protocol as Protocol);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compile failed");
      setStage("review");
    }
  }

  return (
    <>
      <SiteHeader active="author" />
      <main className="mx-auto max-w-[920px] px-6 pb-28 pt-12">
        <div className="border-b border-line pb-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-stone-soft">
            Authoring agent
          </p>
          <h1 className="font-display text-4xl text-ink">
            Compose your protocol from the evidence
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Opus reads your sources, surfaces the genuine decision forks, and
            walks you through them. Your choices compile into structured,
            versioned units with dual provenance.
          </p>
        </div>

        <Steps stage={stage} />

        {error && (
          <div className="mt-6 rounded-lg border border-amber/40 bg-amber-bg px-4 py-3 text-sm text-amber">
            {error}
          </div>
        )}

        {stage === "upload" && !busy && (
          <Upload
            files={files}
            setFiles={setFiles}
            notes={notes}
            setNotes={setNotes}
            busy={busy}
            onRun={runIngest}
          />
        )}

        {stage === "upload" && busy && (
          <Ingesting
            trace={trace}
            phase={phase}
            files={files}
            discoveries={discoveries}
          />
        )}

        {stage === "review" && ingest && (
          <Review ingest={ingest} onBegin={() => setStage("interview")} />
        )}

        {stage === "interview" && ingest && (
          <Interview
            fork={ingest.forks[forkIndex]}
            index={forkIndex}
            total={ingest.forks.length}
            message={turnMsg}
            loading={turnLoading}
            onChoose={chooseOption}
          />
        )}

        {stage === "compiling" && (
          <div className="mt-12 text-center">
            <p className="animate-pulse font-display text-2xl text-ink">
              Compiling structured units with dual provenance…
            </p>
          </div>
        )}

        {stage === "done" && authored && (
          <Done protocol={authored} decisions={decisions} version={protocol.version} />
        )}
      </main>
    </>
  );
}

// ── Steps indicator ────────────────────────────────────────────────────────

function Steps({ stage }: { stage: Stage }) {
  const order: Stage[] = ["upload", "review", "interview", "compiling", "done"];
  const labels: Record<Stage, string> = {
    upload: "Ingest",
    review: "Forks",
    interview: "Interview",
    compiling: "Compile",
    done: "Live",
  };
  const at = order.indexOf(stage);
  return (
    <div className="mt-7 flex flex-wrap gap-2">
      {order.map((s, i) => (
        <span
          key={s}
          className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
            i <= at
              ? "bg-stone text-paper"
              : "border border-line text-ink-muted"
          }`}
        >
          {labels[s]}
        </span>
      ))}
    </div>
  );
}

// ── Upload ─────────────────────────────────────────────────────────────────

function Upload({
  files,
  setFiles,
  notes,
  setNotes,
  busy,
  onRun,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  notes: string;
  setNotes: (s: string) => void;
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <div className="mt-8 space-y-6">
      <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-line-strong bg-card p-10 text-center transition-colors hover:border-stone-soft">
        <input
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <p className="font-display text-xl text-ink">
          Drop source PDFs here
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Society guidelines, research papers, your existing protocol. Opus reads
          them natively. Keep each focused (under ~3&nbsp;MB).
        </p>
        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {files.map((f) => (
              <span
                key={f.name}
                className="rounded bg-stone-bg px-2 py-1 font-mono text-[11px] text-stone"
              >
                {f.name}
              </span>
            ))}
          </div>
        )}
      </label>

      <div>
        <label className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-stone-soft">
          Or paste source notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste guideline text or your org's existing protocol…"
          className="h-32 w-full resize-none rounded-xl border border-line bg-card p-4 text-sm text-ink outline-none focus:border-stone-soft"
        />
      </div>

      <button
        onClick={onRun}
        disabled={busy || (files.length === 0 && notes.trim() === "")}
        className="w-full rounded-full bg-stone py-3.5 text-sm font-medium text-paper transition-colors hover:bg-stone-deep disabled:opacity-50"
      >
        {busy ? "Reading the sources with Opus…" : "Synthesize sources →"}
      </button>
    </div>
  );
}

// ── Ingesting (live reasoning console) ───────────────────────────────────────

function Ingesting({
  trace,
  phase,
  files,
  discoveries,
}: {
  trace: string;
  phase: "reading" | "drafting";
  files: File[];
  discoveries: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [trace, discoveries]);

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-soft">
          {phase === "reading"
            ? "Opus is reading your sources"
            : `Opus is drafting structured units · ${discoveries.length} surfaced`}
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone" />
          live reasoning
        </div>
      </div>

      <div
        ref={ref}
        className="h-[440px] overflow-y-auto rounded-2xl border border-stone-deep bg-stone-deep p-6 shadow-inner"
      >
        {trace && (
          <p className="mb-4 whitespace-pre-wrap border-l-2 border-stone-soft/40 pl-3 font-mono text-[12px] leading-relaxed text-paper/60">
            {trace}
          </p>
        )}

        {discoveries.length === 0 && !trace && (
          <p className="font-mono text-[13px] text-paper/70">
            Establishing context from the sources…
          </p>
        )}

        <ul className="space-y-1.5">
          {discoveries.map((d, i) => {
            const [tag, ...rest] = d.split(" — ");
            return (
              <li
                key={i}
                className="font-mono text-[13px] leading-snug text-paper/90"
                style={{ animation: "fadeIn 280ms ease-out" }}
              >
                <span className="text-stone-soft">
                  {tag === "Decision fork"
                    ? "◆"
                    : tag === "Option"
                      ? "  ·"
                      : "▸"}{" "}
                </span>
                <span className="uppercase tracking-[0.1em] text-stone-soft/70 text-[10px]">
                  {tag}
                </span>{" "}
                {rest.join(" — ")}
              </li>
            );
          })}
        </ul>

        <span className="mt-1 inline-block h-4 w-[7px] translate-y-0.5 animate-pulse bg-paper/70" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {files.map((f) => (
          <span
            key={f.name}
            className="rounded bg-stone-bg px-2 py-1 font-mono text-[11px] text-stone"
          >
            {f.name}
          </span>
        ))}
        {files.length === 0 && (
          <span className="font-mono text-[11px] text-ink-muted">
            reading pasted notes
          </span>
        )}
      </div>
    </div>
  );
}

// ── Review (forks surfaced) ──────────────────────────────────────────────────

function Review({
  ingest,
  onBegin,
}: {
  ingest: IngestResult;
  onBegin: () => void;
}) {
  return (
    <div className="mt-8 space-y-8">
      <div>
        <h2 className="font-display text-2xl text-ink">
          {ingest.forks.length} decision forks surfaced
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          From {ingest.sources.map((s) => s.name).join(", ") || "your sources"} ·{" "}
          {ingest.candidateUnits.length} candidate units extracted
        </p>
      </div>

      <div className="space-y-4">
        {ingest.forks.map((f) => (
          <div key={f.id} className="rounded-xl border border-line bg-card p-5">
            <p className="font-display text-lg text-ink">{f.question}</p>
            <p className="mt-1 text-sm text-ink-muted">{f.tension}</p>
            <div className="mt-3 space-y-2">
              {f.options.map((o) => (
                <div
                  key={o.label}
                  className="border-l-2 border-stone-soft/50 pl-3"
                >
                  <p className="text-sm font-medium text-ink">
                    {o.label}
                    {o.label === f.recommendedLabel && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-soft">
                        evidence-leaning
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] leading-snug text-ink-muted">
                    <span className="font-display italic text-ink/80">
                      &ldquo;{o.sourceQuote}&rdquo;
                    </span>{" "}
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-stone-soft">
                      — {o.sourceCitation}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onBegin}
        className="w-full rounded-full bg-stone py-3.5 text-sm font-medium text-paper transition-colors hover:bg-stone-deep"
      >
        Begin the grounded interview →
      </button>
    </div>
  );
}

// ── Interview ────────────────────────────────────────────────────────────────

function Interview({
  fork,
  index,
  total,
  message,
  loading,
  onChoose,
}: {
  fork: Fork;
  index: number;
  total: number;
  message: string;
  loading: boolean;
  onChoose: (o: ForkOption) => void;
}) {
  return (
    <div className="mt-8">
      <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-stone-soft">
        Decision {index + 1} of {total}
      </div>

      <div className="rounded-2xl border border-line bg-card p-6">
        {loading ? (
          <p className="animate-pulse font-display text-lg text-ink-muted">
            Opus is grounding this question in your sources…
          </p>
        ) : (
          <p className="font-display text-xl leading-relaxed text-ink">
            {message}
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {fork.options.map((o) => (
          <button
            key={o.label}
            disabled={loading}
            onClick={() => onChoose(o)}
            className="group block w-full rounded-xl border border-line bg-card p-4 text-left transition-colors hover:border-stone disabled:opacity-50"
          >
            <p className="font-display text-lg text-ink group-hover:text-stone">
              {o.label}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-ink-muted">
              <span className="font-display italic text-ink/80">
                &ldquo;{o.sourceQuote}&rdquo;
              </span>{" "}
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-stone-soft">
                — {o.sourceCitation}
              </span>
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Done ─────────────────────────────────────────────────────────────────────

function Done({
  protocol,
  decisions,
  version,
}: {
  protocol: Protocol;
  decisions: Decision[];
  version: number;
}) {
  return (
    <div className="mt-10 space-y-6">
      <div className="rounded-2xl border border-moss/40 bg-moss-bg p-6">
        <h2 className="font-display text-2xl text-ink">
          Protocol compiled & live
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {protocol.units.length} structured units, each carrying its source
          citation and the org decision that selected it. Now driving the point
          of care at version {protocol.version}{" "}
          {version !== protocol.version ? `(was v${version})` : ""}.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6">
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-soft">
          Decisions confirmed
        </h3>
        <ul className="space-y-2">
          {decisions.map((d) => (
            <li key={d.forkId} className="text-sm text-ink-muted">
              {d.question}{" "}
              <span className="font-medium text-stone">→ {d.chosenLabel}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/care"
        className="block w-full rounded-full bg-stone py-3.5 text-center text-sm font-medium text-paper transition-colors hover:bg-stone-deep"
      >
        Open the clinic — see it composed →
      </Link>
    </div>
  );
}
