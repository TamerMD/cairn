"use client";

import Link from "next/link";
import { useProtocol } from "@/app/providers";
import { composeVisitPlan } from "@/lib/compose";
import { loadPatients } from "@/lib/store";
import { SiteHeader } from "@/components/ui";

const PATIENTS = loadPatients();

export default function CarePage() {
  const { protocol } = useProtocol();

  return (
    <>
      <SiteHeader active="care" />
      <main className="mx-auto max-w-[1180px] px-6 pb-24 pt-12">
        <div className="flex items-end justify-between border-b border-line pb-5">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-stone-soft">
              Point of care
            </p>
            <h1 className="font-display text-4xl text-ink">Worklist</h1>
          </div>
          <div className="text-right font-mono text-xs uppercase tracking-[0.14em] text-ink-muted">
            <div className="text-stone">{protocol.condition} protocol</div>
            <div>version {protocol.version}</div>
          </div>
        </div>

        <ul className="mt-2 divide-y divide-line">
          {PATIENTS.map((p) => {
            const plan = composeVisitPlan(protocol, p);
            return (
              <li key={p.id}>
                <Link
                  href={`/care/${p.id}`}
                  className="group flex items-center justify-between gap-6 py-6 transition-colors hover:bg-card/60"
                >
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl text-ink transition-colors group-hover:text-stone">
                      {p.name}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">{p.oneLiner}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {plan.eligible ? (
                      <>
                        <div className="font-display text-3xl text-stone">
                          {plan.items.length}
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
                          indicated items
                        </div>
                      </>
                    ) : (
                      <div className="max-w-[160px] font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-ink-muted">
                        Outside {protocol.condition} service line
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-stone-soft transition-transform group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
