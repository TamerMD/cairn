"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProtocol } from "@/app/providers";
import { composeVisitPlan } from "@/lib/compose";
import { loadPatients } from "@/lib/store";
import { SiteHeader } from "@/components/ui";
import type { Condition, Predicate, ProtocolUnit } from "@/lib/types";

const PATIENTS = loadPatients();
const NUMERIC_OPS = new Set(["gt", "lt", "gte", "lte", "equals"]);

function numericConditions(trigger: Predicate): Condition[] {
  return [...(trigger.all ?? []), ...(trigger.any ?? [])].filter(
    (c) => NUMERIC_OPS.has(c.op) && typeof c.value === "number",
  );
}

export default function ProtocolEditor() {
  const { protocol, updateUnit, resetProtocol, adherence } = useProtocol();
  const [previewId, setPreviewId] = useState(PATIENTS[0].id);

  const preview = useMemo(() => {
    const p = PATIENTS.find((x) => x.id === previewId)!;
    return composeVisitPlan(protocol, p);
  }, [protocol, previewId]);

  function setTriggerValue(unit: ProtocolUnit, cond: Condition, value: number) {
    const remap = (cs?: Condition[]) =>
      cs?.map((c) =>
        c.fact === cond.fact && c.op === cond.op ? { ...c, value } : c,
      );
    updateUnit(unit.id, {
      trigger: { all: remap(unit.trigger.all), any: remap(unit.trigger.any) },
    });
  }

  const acted = adherence.length;
  const accepted = adherence.filter((a) => a.action === "accepted").length;

  return (
    <>
      <SiteHeader active="protocol" />
      <main className="mx-auto max-w-[1180px] px-6 pb-28 pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-stone-soft">
              Change & governance
            </p>
            <h1 className="font-display text-4xl text-ink">
              {protocol.condition} protocol
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Edit a rule and the next matching encounter changes instantly — no
              redeploy, no retraining.
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-3xl text-stone">
              v{protocol.version}
            </div>
            <button
              onClick={resetProtocol}
              className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted hover:text-amber"
            >
              Reset to seed
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Editable units */}
          <div className="space-y-3 lg:col-span-2">
            {protocol.units.map((u) => {
              const nums = numericConditions(u.trigger);
              return (
                <div
                  key={u.id}
                  className={`rounded-xl border bg-card p-4 ${
                    u.status === "approved" ? "border-line" : "border-line opacity-55"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-soft">
                      {u.type} · {u.id} · v{u.version}
                    </span>
                    <button
                      onClick={() =>
                        updateUnit(u.id, {
                          status: u.status === "approved" ? "draft" : "approved",
                        })
                      }
                      className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                        u.status === "approved"
                          ? "border-moss text-moss"
                          : "border-line text-ink-muted"
                      }`}
                    >
                      {u.status}
                    </button>
                  </div>

                  <ContentField unit={u} onSave={(content) => updateUnit(u.id, { content })} />

                  {nums.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {nums.map((c) => (
                        <label
                          key={`${c.fact}-${c.op}`}
                          className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted"
                        >
                          {c.label ?? c.fact} {c.op}
                          <input
                            type="number"
                            defaultValue={Number(c.value)}
                            onChange={(e) =>
                              setTriggerValue(u, c, Number(e.target.value))
                            }
                            className="w-16 rounded border border-line bg-paper px-1.5 py-0.5 text-ink outline-none focus:border-stone-soft"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Live preview + adherence */}
          <aside className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-2xl border border-line bg-card p-5">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-soft">
                  Live preview
                </h2>
                <select
                  value={previewId}
                  onChange={(e) => setPreviewId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none"
                >
                  {PATIENTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {preview.eligible ? (
                  <>
                    <p className="mt-3 font-display text-2xl text-stone">
                      {preview.items.length} items
                    </p>
                    <ul className="mt-2 space-y-1">
                      {preview.items.map((i) => (
                        <li key={i.id} className="text-[13px] text-ink-muted">
                          <span className="font-mono text-[10px] uppercase text-stone-soft">
                            {i.kind}
                          </span>{" "}
                          {i.content}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">
                    Not in the {protocol.condition} service line.
                  </p>
                )}
                <Link
                  href={`/care/${previewId}`}
                  className="mt-4 block rounded-full border border-line-strong py-2 text-center text-sm text-ink transition-colors hover:border-stone hover:text-stone"
                >
                  Open this encounter →
                </Link>
              </div>

              <div className="rounded-2xl border border-line bg-paper-deep/40 p-5">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-soft">
                  Adherence
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  {acted === 0
                    ? "No actions recorded yet."
                    : `${accepted}/${acted} surfaced actions accepted; ${acted - accepted} overridden.`}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

function ContentField({
  unit,
  onSave,
}: {
  unit: ProtocolUnit;
  onSave: (content: string) => void;
}) {
  const [value, setValue] = useState(unit.content);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== unit.content && onSave(value)}
      className="mt-2 w-full rounded-lg border border-transparent bg-paper/60 px-2 py-1.5 font-display text-base text-ink outline-none hover:border-line focus:border-stone-soft"
    />
  );
}
