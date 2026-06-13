// ── Curated decision forks for PCOS ───────────────────────────────────────────
// The interview is *bounded* to this pre-validated set so it is reliably crisp
// rather than open-endedly flaky. Opus genuinely reads the uploaded PDFs and
// grounds each option in real quotes from them; this list only steers WHICH
// forks get resolved (and maps each to the Decision/units it governs).

export interface CuratedForkOption {
  label: string;
  /** What to look for in the sources to ground this option. */
  sourceHint: string;
}

export interface CuratedFork {
  id: string;
  /** The Decision id this fork resolves (and the units that carry decisionRef). */
  decisionId: string;
  question: string;
  /** Orientation for Opus on where sources diverge or leave latitude. */
  tension: string;
  options: CuratedForkOption[];
  /** Units whose inclusion/trigger depends on this decision. */
  affectsUnitIds: string[];
}

export const PCOS_FORKS: CuratedFork[] = [
  {
    id: "fork-amh",
    decisionId: "d-amh",
    question:
      "How should polycystic ovarian morphology (PCOM) be confirmed in adults?",
    tension:
      "The 2023 guideline endorses serum AMH as an alternative to ultrasound in adults; the original Rotterdam criteria specify transvaginal ultrasound.",
    options: [
      {
        label: "Serum AMH (alternative to ultrasound in adults)",
        sourceHint:
          "2023 guideline statement permitting AMH in lieu of ultrasound for adult PCOM.",
      },
      {
        label: "Pelvic ultrasound (Rotterdam)",
        sourceHint:
          "Rotterdam follicle-count / ovarian-volume ultrasound thresholds.",
      },
    ],
    affectsUnitIds: ["u-amh"],
  },
  {
    id: "fork-ovulation",
    decisionId: "d-ovulation",
    question:
      "What is first-line pharmacological ovulation induction for anovulatory infertility?",
    tension:
      "Recent RCT evidence and the 2023 guideline favor letrozole; legacy practice used clomiphene citrate first.",
    options: [
      {
        label: "Letrozole",
        sourceHint:
          "Head-to-head live-birth/ovulation-rate data favoring letrozole over clomiphene.",
      },
      {
        label: "Clomiphene citrate",
        sourceHint: "Historical first-line ovulation-induction agent.",
      },
    ],
    affectsUnitIds: ["u-letrozole"],
  },
  {
    id: "fork-glycaemic",
    decisionId: "d-glycaemic",
    question: "Which test should baseline glycaemic assessment use?",
    tension:
      "The guideline prefers a 75 g OGTT (especially at BMI ≥ 25); HbA1c/fasting glucose are more convenient but less sensitive in PCOS.",
    options: [
      {
        label: "75 g 2-hour OGTT for BMI ≥ 25",
        sourceHint:
          "Guideline preference for OGTT to assess glycaemic status in PCOS.",
      },
      {
        label: "HbA1c or fasting glucose",
        sourceHint: "Convenience-based single-sample dysglycaemia screening.",
      },
    ],
    affectsUnitIds: ["u-ogtt"],
  },
  {
    id: "fork-cadence",
    decisionId: "d-cadence",
    question: "What routine follow-up cadence should this service line use?",
    tension:
      "Guidelines leave cadence to local policy; the org must choose an interval for active-management patients.",
    options: [
      { label: "3 months", sourceHint: "Quarterly review for active management." },
      { label: "6 months", sourceHint: "Six-monthly review for stable patients." },
    ],
    affectsUnitIds: ["u-followup"],
  },
  {
    id: "fork-followup-owner",
    decisionId: "d-followup-owner",
    question: "Who should lead routine PCOS follow-up?",
    tension:
      "An operational policy choice the literature does not dictate: nurse-led coordination vs. physician-led review.",
    options: [
      {
        label: "Nurse-led care coordinator",
        sourceHint: "Nurse-led clinic model for routine follow-up.",
      },
      { label: "Physician", sourceHint: "Physician-led review." },
    ],
    affectsUnitIds: ["u-followup"],
  },
];
