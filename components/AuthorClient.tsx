"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useProtocol } from "@/app/providers";
import { SiteHeader } from "@/components/ui";
import type { Protocol } from "@/lib/types";

type Stage = "upload" | "review" | "interview" | "compiling" | "done";
type Msg = { role: "assistant" | "user"; content: string };

interface Dimension {
  dimension: string;
  summary: string;
  sourceQuote: string;
  sourceLocator: string;
}
interface DiscussionPoint {
  question: string;
  why: string;
}
interface Synthesis {
  condition: string;
  summary: string;
  sources: { name: string }[];
  dimensions: Dimension[];
  discussionPoints: DiscussionPoint[];
}
interface Coverage {
  id: string;
  eligible: boolean;
  items: number;
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
  const { replaceProtocol } = useProtocol();
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // streaming console
  const [trace, setTrace] = useState("");
  const [phase, setPhase] = useState<"reading" | "drafting">("reading");
  const [discoveries, setDiscoveries] = useState<string[]>([]);
  const draftBuf = useRef("");
  const seen = useRef<Set<string>>(new Set());

  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);

  // interview
  const [messages, setMessages] = useState<Msg[]>([]);
  const [turnBusy, setTurnBusy] = useState(false);
  const [readyToCompile, setReadyToCompile] = useState(false);
  const [input, setInput] = useState("");

  const [authored, setAuthored] = useState<Protocol | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);

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
        body: JSON.stringify({ pdfs, notes }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Synthesis failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let result: Synthesis | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "thinking") setTrace((t) => t + evt.text);
          else if (evt.type === "phase") setPhase("drafting");
          else if (evt.type === "draft") {
            draftBuf.current += evt.text;
            const re = /"(dimension|question)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
            const found: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(draftBuf.current))) {
              const val = m[2].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
              const tag = `${m[1]}:${val}`;
              if (val && !seen.current.has(tag)) {
                seen.current.add(tag);
                found.push(
                  `${m[1] === "dimension" ? "Dimension" : "Discussion point"} — ${val}`,
                );
              }
            }
            if (found.length) setDiscoveries((d) => [...d, ...found]);
          } else if (evt.type === "error") throw new Error(evt.error);
          else if (evt.type === "result") result = evt.result as Synthesis;
        }
      }
      if (!result) throw new Error("No synthesis returned");
      setSynthesis(result);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Synthesis failed");
    } finally {
      setBusy(false);
    }
  }

  async function interviewTurn(history: Msg[]) {
    setTurnBusy(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ synthesis, messages: history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Interview failed");
      setMessages((m) => [...m, { role: "assistant", content: data.assistantMessage }]);
      setReadyToCompile(Boolean(data.readyToCompile));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Interview failed");
    } finally {
      setTurnBusy(false);
    }
  }

  function beginInterview() {
    setStage("interview");
    setMessages([]);
    setReadyToCompile(false);
    void interviewTurn([]);
  }

  function sendMessage() {
    const text = input.trim();
    if (!text || turnBusy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    void interviewTurn(next);
  }

  async function compile() {
    setStage("compiling");
    setError(null);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          synthesis,
          messages,
          condition: synthesis?.condition,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Compile failed");
      replaceProtocol(data.protocol as Protocol);
      setAuthored(data.protocol as Protocol);
      setCoverage(data.coverage ?? []);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compile failed");
      setStage("interview");
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
            Define your protocol with Opus
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Upload your sources. Opus synthesizes a draft across diagnosis,
            eligibility, work-up, therapy, and follow-up, then works through it
            with you in conversation. The result is a computable protocol that
            runs on patient charts.
          </p>
        </div>

        <Steps stage={stage} />

        {error && (
          <div className="mt-6 rounded-lg border border-flag/40 bg-flag-bg px-4 py-3 text-sm text-flag">
            {error}
          </div>
        )}

        {stage === "upload" && !busy && (
          <Upload
            files={files}
            setFiles={setFiles}
            notes={notes}
            setNotes={setNotes}
            onRun={runIngest}
          />
        )}
        {stage === "upload" && busy && (
          <Ingesting trace={trace} phase={phase} files={files} discoveries={discoveries} />
        )}
        {stage === "review" && synthesis && (
          <Review synthesis={synthesis} onBegin={beginInterview} />
        )}
        {stage === "interview" && (
          <Interview
            messages={messages}
            input={input}
            setInput={setInput}
            onSend={sendMessage}
            turnBusy={turnBusy}
            readyToCompile={readyToCompile}
            onCompile={compile}
          />
        )}
        {stage === "compiling" && <Compiling />}
        {stage === "done" && authored && (
          <Done protocol={authored} coverage={coverage} />
        )}
      </main>
    </>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Steps({ stage }: { stage: Stage }) {
  const order: Stage[] = ["upload", "review", "interview", "compiling", "done"];
  const labels: Record<Stage, string> = {
    upload: "Synthesize",
    review: "Draft",
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
            i <= at ? "bg-stone text-paper" : "border border-line text-ink-muted"
          }`}
        >
          {labels[s]}
        </span>
      ))}
    </div>
  );
}

// ── Upload ─────────────────────────────────────────────────────────────────────

function Upload({
  files,
  setFiles,
  notes,
  setNotes,
  onRun,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  notes: string;
  setNotes: (s: string) => void;
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
          onChange={(e) =>
            setFiles([...files, ...Array.from(e.target.files ?? [])])
          }
        />
        <p className="font-display text-xl text-ink">Drop source PDFs here</p>
        <p className="mt-1 text-sm text-ink-muted">
          Upload several — society guidelines, papers, your existing protocol.
          Opus reads them natively. Keep each focused (under ~3&nbsp;MB).
        </p>
        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {files.map((f, i) => (
              <span
                key={i}
                className="rounded bg-stone-bg px-2 py-1 font-mono text-[11px] text-stone"
              >
                {f.name}
              </span>
            ))}
          </div>
        )}
      </label>

      <div>
        <label className="mb-2 block text-sm font-medium text-ink-muted">
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
        disabled={files.length === 0 && notes.trim() === ""}
        className="w-full rounded-full bg-stone py-3.5 text-sm font-medium text-paper transition-colors hover:bg-stone-deep disabled:opacity-50"
      >
        Synthesize sources →
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
        <div className="text-sm font-semibold text-stone">
          {phase === "reading"
            ? "Opus is reading your sources"
            : `Opus is drafting the protocol · ${discoveries.length} elements`}
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
                  {tag === "Dimension" ? "◆ " : "› "}
                </span>
                <span className="text-[10px] uppercase tracking-[0.1em] text-stone-soft/70">
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
        {files.length > 0 ? (
          files.map((f, i) => (
            <span
              key={i}
              className="rounded bg-stone-bg px-2 py-1 font-mono text-[11px] text-stone"
            >
              {f.name}
            </span>
          ))
        ) : (
          <span className="font-mono text-[11px] text-ink-muted">
            reading pasted notes
          </span>
        )}
      </div>
    </div>
  );
}

// ── Review (synthesis) ───────────────────────────────────────────────────────

const DIM_LABEL: Record<string, string> = {
  diagnosis: "Diagnosis",
  inclusion: "Inclusion",
  exclusion: "Exclusion",
  workup: "Work-up",
  preferredTherapy: "Preferred therapy",
  followUp: "Follow-up",
  monitoring: "Monitoring",
  counseling: "Counseling",
  other: "Other",
};

function Review({
  synthesis,
  onBegin,
}: {
  synthesis: Synthesis;
  onBegin: () => void;
}) {
  return (
    <div className="mt-8 space-y-8">
      <div>
        <div className="mb-1 flex items-baseline gap-3">
          <h2 className="font-display text-2xl text-ink">{synthesis.condition}</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-soft">
            draft synthesis
          </span>
        </div>
        <p className="text-sm leading-relaxed text-ink-muted">{synthesis.summary}</p>
        <p className="mt-1 font-mono text-[11px] text-stone-soft">
          {synthesis.sources.map((s) => s.name).join(" · ")}
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink">Dimensions covered</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {synthesis.dimensions.map((d, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-4">
              <span className="inline-flex rounded-full bg-stone-bg px-2 py-0.5 text-[11px] font-medium text-stone">
                {DIM_LABEL[d.dimension] ?? d.dimension}
              </span>
              <p className="mt-2 text-sm text-ink">{d.summary}</p>
              <p className="mt-1.5 text-[12px] italic leading-snug text-ink-muted">
                &ldquo;{d.sourceQuote}&rdquo;
                <span className="ml-1 font-mono text-[10px] not-italic text-stone-soft">
                  — {d.sourceLocator}
                </span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {synthesis.discussionPoints.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">
            Discussion points to settle
          </h3>
          <ul className="space-y-2">
            {synthesis.discussionPoints.map((p, i) => (
              <li
                key={i}
                className="rounded-xl border border-line bg-card p-4 text-sm"
              >
                <span className="text-ink">{p.question}</span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">
                  {p.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onBegin}
        className="w-full rounded-full bg-stone py-3.5 text-sm font-medium text-paper transition-colors hover:bg-stone-deep"
      >
        Work through it with Opus →
      </button>
    </div>
  );
}

// ── Interview (free-flowing chat) ────────────────────────────────────────────

function Interview({
  messages,
  input,
  setInput,
  onSend,
  turnBusy,
  readyToCompile,
  onCompile,
}: {
  messages: Msg[];
  input: string;
  setInput: (s: string) => void;
  onSend: () => void;
  turnBusy: boolean;
  readyToCompile: boolean;
  onCompile: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, turnBusy]);

  return (
    <div className="mt-8">
      <div className="h-[420px] overflow-y-auto rounded-2xl border border-line bg-card p-5">
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "assistant" ? "" : "flex justify-end"}
            >
              <div
                className={
                  m.role === "assistant"
                    ? "max-w-[85%] text-[15px] leading-relaxed text-ink"
                    : "max-w-[85%] rounded-2xl rounded-br-sm bg-stone px-4 py-2 text-[15px] leading-relaxed text-paper"
                }
              >
                {m.role === "assistant" && (
                  <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-stone-soft">
                    Cairn
                  </span>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {turnBusy && (
            <p className="animate-pulse text-[15px] text-ink-muted">Cairn is thinking…</p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {readyToCompile && (
        <p className="mt-3 text-center text-sm text-moss">
          Opus has enough to compile — or keep refining.
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder="Answer, steer, or add a constraint… (Enter to send)"
          className="flex-1 resize-none rounded-xl border border-line bg-card p-3 text-sm text-ink outline-none focus:border-stone-soft"
        />
        <button
          onClick={onSend}
          disabled={turnBusy || !input.trim()}
          className="rounded-full border border-line-strong px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-stone hover:text-stone disabled:opacity-40"
        >
          Send
        </button>
      </div>

      <button
        onClick={onCompile}
        className={`mt-3 w-full rounded-full py-3.5 text-sm font-medium transition-colors ${
          readyToCompile
            ? "bg-stone text-paper hover:bg-stone-deep"
            : "border border-line-strong text-ink hover:border-stone hover:text-stone"
        }`}
      >
        Compile the protocol →
      </button>
    </div>
  );
}

// ── Compiling (parallel fan-out) ─────────────────────────────────────────────

function Compiling() {
  const groups = [
    "Eligibility & exclusions",
    "Recommended work-up",
    "Preferred therapy",
    "Follow-up & monitoring",
    "Note scaffold",
  ];
  return (
    <div className="mt-12">
      <p className="text-center font-display text-2xl text-ink">
        Compiling computable units
      </p>
      <p className="mt-2 text-center text-sm text-ink-muted">
        Authoring triggers across dimensions in parallel — each grounded in your
        sources and decisions.
      </p>
      <div className="mx-auto mt-8 max-w-md space-y-2">
        {groups.map((g, i) => (
          <div
            key={g}
            className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-2.5"
            style={{ animation: `fadeIn 320ms ease-out ${i * 90}ms both` }}
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-stone" />
            <span className="text-[14px] text-ink">{g}</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-stone-soft">
              authoring…
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Done ─────────────────────────────────────────────────────────────────────

function Done({
  protocol,
  coverage,
}: {
  protocol: Protocol;
  coverage: Coverage[];
}) {
  const byDim = protocol.units.reduce<Record<string, number>>((acc, u) => {
    const k = u.dimension ?? u.type;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <div className="mt-10 space-y-6">
      <div className="rounded-2xl border border-moss/40 bg-moss-bg p-6">
        <h2 className="font-display text-2xl text-ink">
          {protocol.condition} protocol compiled & live
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {protocol.units.length} computable units across{" "}
          {Object.keys(byDim).length} dimensions, each with its source citation
          and the org decision behind it — now running on patient charts.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6">
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Runs on the current charts
        </h3>
        <ul className="space-y-1.5">
          {coverage.map((c) => (
            <li key={c.id} className="flex justify-between text-sm">
              <span className="text-ink">{c.id}</span>
              <span className={c.eligible ? "text-stone" : "text-ink-muted"}>
                {c.eligible ? `${c.items} items` : "not eligible"}
              </span>
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
