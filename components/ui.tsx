import Link from "next/link";
import type {
  ActionStatus,
  PlanKind,
  SourceRef,
  TriggeringFact,
} from "@/lib/types";

export function CairnMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" className={className} fill="none" aria-hidden="true">
      <ellipse cx="20" cy="42" rx="15" ry="4" fill="currentColor" opacity="0.18" />
      <rect x="9" y="30" width="22" height="9" rx="4.5" fill="currentColor" />
      <rect x="12" y="19" width="16" height="9" rx="4.5" fill="currentColor" opacity="0.85" />
      <rect x="14.5" y="9" width="11" height="8" rx="4" fill="currentColor" opacity="0.7" />
      <rect x="16.5" y="1.5" width="7" height="6" rx="3" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function SiteHeader({ active }: { active?: "author" | "care" }) {
  const link = (href: string, label: string, key: "author" | "care") =>
    (
      <Link
        href={href}
        className={`transition-colors hover:text-stone ${
          active === key ? "text-stone" : "text-ink-muted"
        }`}
      >
        {label}
      </Link>
    );
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <CairnMark className="h-6 w-6 text-stone" />
          <span className="font-mono text-sm font-medium uppercase tracking-[0.32em] text-stone">
            Cairn
          </span>
        </Link>
        <nav className="flex items-center gap-7 font-mono text-xs uppercase tracking-[0.18em]">
          {link("/author", "Author", "author")}
          {link("/care", "Point of care", "care")}
        </nav>
      </div>
    </header>
  );
}

const KIND_META: Record<PlanKind, { label: string; cls: string }> = {
  assess: { label: "Assess", cls: "bg-slate-bg text-slate" },
  discuss: { label: "Discuss", cls: "bg-stone-bg text-stone" },
  order: { label: "Order", cls: "bg-paper-deep text-ink-muted" },
  refer: { label: "Refer", cls: "bg-paper-deep text-ink-muted" },
};

export function KindTag({ kind }: { kind: PlanKind }) {
  const m = KIND_META[kind];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

const STATUS_META: Record<ActionStatus, { label: string; cls: string; dot: string }> = {
  addressed: { label: "Addressed", cls: "bg-moss-bg text-moss", dot: "bg-moss" },
  gap: { label: "Gap", cls: "bg-amber-bg text-amber", dot: "bg-amber" },
  staged: { label: "Staged for sign-off", cls: "bg-slate-bg text-slate", dot: "bg-slate" },
  new: { label: "New", cls: "bg-stone-bg text-stone", dot: "bg-stone" },
};

export function StatusBadge({ status }: { status: ActionStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${m.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

/** Dual-provenance display: the patient facts that triggered it + the source
 *  the evidence came from + (optionally) the org decision that selected it. */
export function Provenance({
  facts,
  sourceRef,
  decision,
}: {
  facts?: TriggeringFact[];
  sourceRef?: SourceRef;
  decision?: { question: string; chosen: string };
}) {
  return (
    <div className="mt-3 space-y-2.5 border-l-2 border-stone-soft/50 pl-3.5">
      {facts && facts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            Triggered by
          </span>
          {facts.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded bg-stone-bg px-1.5 py-0.5 font-mono text-[11px] text-stone"
            >
              <span className="opacity-60">{f.label}:</span> {f.detail}
            </span>
          ))}
        </div>
      )}
      {sourceRef && (
        <div className="text-[12px] leading-snug text-ink-muted">
          {sourceRef.quote && (
            <span className="font-display italic text-ink/80">
              &ldquo;{sourceRef.quote}&rdquo;{" "}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-soft">
            — {sourceRef.source}
            {sourceRef.locator ? ` · ${sourceRef.locator}` : ""}
          </span>
        </div>
      )}
      {decision && (
        <div className="font-mono text-[11px] text-ink-muted">
          <span className="uppercase tracking-[0.12em] text-stone-soft">
            Org decision ·{" "}
          </span>
          {decision.question}{" "}
          <span className="text-stone">→ {decision.chosen}</span>
        </div>
      )}
    </div>
  );
}
