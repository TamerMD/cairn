"use client";

import Link from "next/link";
import { useState } from "react";
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

export function SiteHeader({
  active,
}: {
  active?: "author" | "care" | "protocol";
}) {
  const link = (
    href: string,
    label: string,
    key: "author" | "care" | "protocol",
  ) => (
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
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <CairnMark className="h-6 w-6 text-stone" />
          <span className="font-mono text-sm font-medium uppercase tracking-[0.32em] text-stone">
            Cairn
          </span>
        </Link>
        <nav className="flex items-center gap-7 font-mono text-xs uppercase tracking-[0.18em]">
          {link("/author", "Author", "author")}
          {link("/protocol", "Protocol", "protocol")}
          {link("/care", "Point of care", "care")}
        </nav>
      </div>
    </header>
  );
}

// Color-coded action types so the eye triages by hue, not by reading labels.
const KIND_META: Record<PlanKind, { label: string; cls: string; dot: string }> = {
  assess: { label: "Assess", cls: "bg-slate-bg text-slate", dot: "bg-slate" },
  discuss: { label: "Discuss", cls: "bg-stone-bg text-stone", dot: "bg-stone" },
  order: { label: "Order", cls: "bg-gold-bg text-gold", dot: "bg-gold" },
  refer: { label: "Refer", cls: "bg-plum-bg text-plum", dot: "bg-plum" },
};

export function kindDot(kind: PlanKind): string {
  return KIND_META[kind].dot;
}

export function KindTag({ kind }: { kind: PlanKind }) {
  const m = KIND_META[kind];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

const STATUS_META: Record<
  ActionStatus,
  { label: string; cls: string; dot: string }
> = {
  addressed: { label: "Addressed", cls: "bg-moss-bg text-moss", dot: "bg-moss" },
  gap: { label: "Gap", cls: "bg-flag-bg text-flag", dot: "bg-flag" },
  staged: { label: "Staged", cls: "bg-slate-bg text-slate", dot: "bg-slate" },
  new: { label: "New", cls: "bg-stone-bg text-stone", dot: "bg-stone" },
};

export function StatusBadge({ status }: { status: ActionStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function FactChip({ fact }: { fact: TriggeringFact }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[11px] text-ink">
      <span className="text-ink-muted">{fact.label}:</span> {fact.detail}
    </span>
  );
}

/**
 * Progressive dual provenance. Shows only the *distinguishing* triggers inline
 * (the universal problem-list fact is dropped — it explains nothing); the source
 * quote and org decision sit behind a "Why?" toggle so they're one tap away
 * rather than always-on wallpaper.
 */
export function Provenance({
  facts,
  sourceRef,
  decision,
}: {
  facts?: TriggeringFact[];
  sourceRef?: SourceRef;
  decision?: { question: string; chosen: string };
}) {
  const [open, setOpen] = useState(false);
  const distinguishing = (facts ?? []).filter((f) => f.fact !== "problems");
  const hasWhy = Boolean((sourceRef && sourceRef.quote) || decision);

  if (distinguishing.length === 0 && !hasWhy) return null;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {distinguishing.map((f, i) => (
          <FactChip key={i} fact={f} />
        ))}
        {hasWhy && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="rounded text-[11px] font-medium text-stone-soft underline-offset-2 hover:text-stone hover:underline"
          >
            {open ? "Hide source" : "Why?"}
          </button>
        )}
      </div>
      {open && hasWhy && (
        <div className="mt-2 space-y-1.5 border-l-2 border-stone-soft/40 pl-3">
          {sourceRef && sourceRef.quote && (
            <p className="text-[12px] leading-snug text-ink-muted">
              <span className="font-display italic text-ink/80">
                &ldquo;{sourceRef.quote}&rdquo;
              </span>{" "}
              <span className="font-mono text-[10px] text-stone-soft">
                — {sourceRef.source}
                {sourceRef.locator ? ` · ${sourceRef.locator}` : ""}
              </span>
            </p>
          )}
          {decision && (
            <p className="text-[12px] text-ink-muted">
              <span className="font-medium text-stone-soft">Org decision · </span>
              {decision.question}{" "}
              <span className="text-stone">→ {decision.chosen}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
