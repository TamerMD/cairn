// ── Cairn core types ────────────────────────────────────────────────────────
// The deterministic spine (match → compose → reconcile) and the authored
// protocol artifact both speak these types. Pure data; no runtime deps so it
// is importable from server routes, client components, and the vitest suite.

// ── Patient (structured synthetic seed; no PHI) ───────────────────────────────

export interface Lab {
  name: string;
  value: number | string;
  unit?: string;
  date: string; // ISO yyyy-mm-dd
}

export interface Vital {
  name: string;
  value: number;
  unit?: string;
  date: string; // ISO yyyy-mm-dd
}

export interface Patient {
  id: string;
  name: string;
  demographics: { age: number; sex: "female" | "male" | "other" };
  problems: string[];
  meds: string[];
  goals: string[]; // e.g. ["Fertility"] — care goals that drive triggers
  labs: Lab[];
  vitals: Vital[];
  oneLiner: string; // human summary for the worklist
}

// ── Structured predicate (the trigger over patient facts) ─────────────────────

export type PredicateOp =
  | "includes"
  | "equals"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "between"
  | "exists"
  | "missing";

export interface Condition {
  /** Fact path: 'age' | 'sex' | 'problems' | 'meds' | 'goals' | 'lab:<name>' | 'vital:<name>' */
  fact: string;
  op: PredicateOp;
  value?: string | number | string[] | [number, number];
  /** For lab/vital exists|missing: the freshness window in days. */
  withinDays?: number;
  /** Human label for provenance display, e.g. "OGTT (75g)". Falls back to fact. */
  label?: string;
}

export interface Predicate {
  all?: Condition[]; // AND
  any?: Condition[]; // OR
}

/** The actual patient value that satisfied a condition — point-of-care provenance. */
export interface TriggeringFact {
  fact: string;
  label: string; // e.g. "Age", "Problem list", "HbA1c"
  detail: string; // e.g. "29 yrs", "PCOS", "no result in 12 months"
}

// ── Protocol units (the authored artifact, dual provenance) ───────────────────

export type UnitType =
  | "eligibility"
  | "order"
  | "captureField"
  | "noteSection"
  | "followUp";

/** How a unit surfaces as a clinician-facing visit-plan action. */
export type PlanKind = "assess" | "discuss" | "order" | "refer";

/** Evidence provenance — what a source actually said. */
export interface SourceRef {
  source: string; // e.g. "2023 Intl Evidence-based PCOS Guideline"
  locator?: string; // e.g. "Rec 3.4b"
  quote?: string; // the cited line from the source
}

export interface ProtocolUnit {
  id: string;
  version: number;
  type: UnitType;
  content: string; // order name / field label / note-section prompt / counseling point
  trigger: Predicate;
  rationale: string; // why this is indicated
  sourceRef: SourceRef; // evidence provenance
  decisionRef?: string; // Decision.id that selected it (org provenance)
  status: "draft" | "approved";
  /** Set on units that should appear as a visit-plan action item. */
  planKind?: PlanKind;
  /** Title for noteSection units. */
  noteSectionKey?: string;
}

// ── Decisions (the forks resolved in the interview) ───────────────────────────

export interface DecisionOption {
  label: string;
  sourceCitation: string; // e.g. "2023 Guideline, Rec 1.2"
  sourceQuote?: string;
}

export interface Decision {
  id: string;
  question: string;
  optionsConsidered: DecisionOption[];
  chosen: string; // label of the chosen option
  version: number;
}

// ── The protocol (versioned; the in-memory / client-held source of truth) ─────

export interface Protocol {
  id: string;
  condition: string; // "PCOS"
  version: number; // bumps on any unit/decision change → drives propagation
  units: ProtocolUnit[];
  decisions: Decision[];
}

// ── Composed encounter artifacts ──────────────────────────────────────────────

export interface VisitPlanItem {
  id: string; // == unitId (stable, used as reconciliation key)
  unitId: string;
  unitVersion: number;
  kind: PlanKind;
  content: string;
  rationale: string;
  sourceRef: SourceRef;
  decisionRef?: string;
  triggeringFacts: TriggeringFact[];
}

export interface NoteScaffoldSection {
  unitId: string;
  key: string; // section title
  prompt: string; // what the section should capture
  triggeringFacts: TriggeringFact[];
}

export interface VisitPlan {
  patientId: string;
  protocolVersion: number;
  eligible: boolean;
  contextSummary: string;
  eligibilityFacts: TriggeringFact[];
  items: VisitPlanItem[];
  noteScaffold: NoteScaffoldSection[];
}

// ── Transcript (in-visit conversation stand-in) ───────────────────────────────

export interface TranscriptTurn {
  spanId: string; // e.g. "t3" — used as note/action provenance
  speaker: "Clinician" | "Patient";
  text: string;
}

export interface Transcript {
  patientId: string;
  turns: TranscriptTurn[];
}

// ── Post-capture: note generation + reconciliation ────────────────────────────

export interface NoteCitation {
  transcriptSpanId: string;
}

export interface GeneratedNoteSection {
  key: string; // matches a NoteScaffoldSection.key
  content: string;
  citations: NoteCitation[];
}

export interface GeneratedNote {
  sections: GeneratedNoteSection[];
}

/** Opus's structured read of what the transcript actually covered. */
export interface AddressedExtraction {
  /** Plan item ids (== unitIds) the conversation addressed. */
  addressedPlanItemIds: string[];
  /** Evidence span per addressed item, for provenance. */
  evidenceByItem?: Record<string, string>; // itemId -> transcriptSpanId
  /** Things discussed that were not in the plan. */
  newItems: { content: string; evidenceSpanId?: string; rationale?: string }[];
}

export type ActionStatus = "addressed" | "gap" | "new" | "staged";

export interface ReconciledAction {
  id: string;
  status: ActionStatus;
  content: string;
  kind?: PlanKind;
  planItemId?: string;
  rationale?: string;
  sourceRef?: SourceRef;
  decisionRef?: string;
  evidence: {
    unitId?: string;
    transcriptSpanId?: string;
    triggeringFacts?: TriggeringFact[];
  };
}

// ── Adherence (secondary signal: surfaced vs. acted) ──────────────────────────

export interface AdherenceEvent {
  encounterId: string;
  actionId: string;
  unitId?: string;
  action: "accepted" | "overridden";
  at: string; // ISO timestamp
}
