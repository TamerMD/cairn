import Link from "next/link";

function CairnMark({ className = "" }: { className?: string }) {
  // Stacked stones — a trail marker.
  return (
    <svg
      viewBox="0 0 40 48"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="20" cy="42" rx="15" ry="4" fill="currentColor" opacity="0.18" />
      <rect x="9" y="30" width="22" height="9" rx="4.5" fill="currentColor" />
      <rect x="12" y="19" width="16" height="9" rx="4.5" fill="currentColor" opacity="0.85" />
      <rect x="14.5" y="9" width="11" height="8" rx="4" fill="currentColor" opacity="0.7" />
      <rect x="16.5" y="1.5" width="7" height="6" rx="3" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

const LOOP = [
  {
    n: "01",
    title: "Author from evidence",
    body: "Upload real guideline PDFs. Opus reads them, surfaces the genuine decision forks, and interviews your medical director through each one.",
  },
  {
    n: "02",
    title: "Compose at the point of care",
    body: "Open a patient and the right protocol units fire — a visit plan, a note to your scaffold, reconciled actions — each carrying its rationale and provenance.",
  },
  {
    n: "03",
    title: "Change, propagated",
    body: "Edit one rule in the protocol. The next matching encounter changes instantly. What takes an EHR months happens in seconds.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-24">
      {/* Masthead */}
      <header className="flex items-center justify-between border-b border-line py-6">
        <div className="flex items-center gap-3">
          <CairnMark className="h-7 w-7 text-stone" />
          <span className="font-mono text-sm font-medium uppercase tracking-[0.32em] text-stone">
            Cairn
          </span>
        </div>
        <nav className="flex items-center gap-7 font-mono text-xs uppercase tracking-[0.18em] text-ink-muted">
          <Link href="/author" className="transition-colors hover:text-stone">
            Author
          </Link>
          <Link href="/care" className="transition-colors hover:text-stone">
            Point of care
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="grid grid-cols-1 gap-10 pt-20 md:grid-cols-12 md:pt-28">
        <div className="md:col-span-8">
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.28em] text-stone-soft">
            The protocol layer for the point of care
          </p>
          <h1 className="font-display text-5xl font-light leading-[1.04] text-ink md:text-[5.25rem]">
            The layer your
            <br />
            EHR doesn&rsquo;t have.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-muted">
            EHRs hold the patient. They hold no representation of{" "}
            <em className="font-display italic text-ink">
              your organization&rsquo;s own best practice
            </em>
            . Cairn operationalizes it — surfacing the right knowledge and
            pre-composing the right actions for the right patient, and updating
            the instant leadership changes a rule.
          </p>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/author"
              className="group inline-flex items-center gap-3 rounded-full bg-stone px-7 py-3.5 text-paper transition-colors hover:bg-stone-deep"
            >
              <span className="text-sm font-medium tracking-wide">
                Author a protocol
              </span>
              <span className="transition-transform group-hover:translate-x-0.5">
                &rarr;
              </span>
            </Link>
            <Link
              href="/care"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:border-stone hover:text-stone"
            >
              Open the clinic
            </Link>
          </div>
        </div>

        <div className="hidden items-end justify-center md:col-span-4 md:flex">
          <CairnMark className="h-44 w-44 text-stone opacity-90" />
        </div>
      </section>

      {/* The loop */}
      <section className="mt-28">
        <div className="mb-10 flex items-baseline gap-4 border-b border-line pb-4">
          <h2 className="font-display text-2xl italic text-ink">One loop</h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-muted">
            shown live
          </span>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {LOOP.map((step) => (
            <div key={step.n} className="bg-card p-8">
              <div className="mb-5 font-mono text-sm text-stone-soft">
                {step.n}
              </div>
              <h3 className="mb-3 font-display text-xl text-ink">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-ink-muted">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer note */}
      <footer className="mt-24 flex flex-col gap-2 border-t border-line pt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted md:flex-row md:items-center md:justify-between">
        <span>
          Advisory by design · clinician decides · synthetic patient data, no PHI
        </span>
        <span className="text-stone-soft">Reasoning by Claude Opus 4.8</span>
      </footer>
    </main>
  );
}
