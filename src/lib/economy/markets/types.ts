/**
 * Prediction market types — shared across `markets/` subfiles.
 *
 * The `outcome_spec` JSONB on `gs_market_templates` is convention,
 * not schema-enforced. These TS types document the convention each
 * `variable_type` follows. Adding a new variable means adding a new
 * union member here AND a generator branch in `./templates.ts`.
 */

export type MarketStatus = "open" | "locked" | "settled" | "cancelled";
export type VariableType = "binary" | "placement" | "pickone" | "count";

export interface MarketRow {
  id: string;
  community_id: string;
  stream_id: string;
  session_id: string;
  game_key: string;
  chapter: number;
  status: MarketStatus;
  template_id: string;
  variable_type: VariableType;
  subject: string | null;
  question: string;
  lock_at: string | null;
  opened_at: string;
  locked_at: string | null;
  resolved_at: string | null;
  cancelled_at: string | null;
  resolved_value: string | null;
  created_by: string;
}

export interface MarketOutcomeRow {
  id: string;
  market_id: string;
  option_key: string;
  label: string;
  is_winner: boolean | null;
}

export interface BetRow {
  id: string;
  market_id: string;
  outcome_id: string;
  identity_id: string;
  amount: number;
  event_id: number | null;
  created_at: string;
}

// ---- outcome_spec shapes (per variable_type) ------------------------------

export interface PlacementThreshold {
  /** Stable option key (e.g. `"win"`, `"top3"`, `"top5"`). Matched
   *  case-insensitively against the bettor's `!bet <option>` token. */
  key: string;
  label: string;
  /** Win condition: bettor wins this pool when the resolved
   *  placement integer is `<=` this value. */
  max_position: number;
}

export interface PlacementOutcomeSpec {
  type: "placement";
  thresholds: PlacementThreshold[];
}

export interface BinaryOption {
  key: string;
  label: string;
}

export interface BinaryOutcomeSpec {
  type: "binary";
  options: [BinaryOption, BinaryOption];
}

export interface PickoneOption {
  key: string;
  label: string;
}

export interface PickoneOutcomeSpec {
  type: "pickone";
  options: PickoneOption[];
}

export interface CountOutcomeSpec {
  type: "count";
  /** The threshold an `over`/`under` resolves against. Bettors choose
   *  `over` or `under`; resolver supplies the actual number, the
   *  outcomes' is_winner is set accordingly. */
  threshold: number;
}

export type OutcomeSpec =
  | PlacementOutcomeSpec
  | BinaryOutcomeSpec
  | PickoneOutcomeSpec
  | CountOutcomeSpec;

/** Generated outcomes the open-market path will INSERT. */
export interface GeneratedOutcome {
  option_key: string;
  label: string;
}

/** What an open-market call produces before the DB insert. */
export interface RenderedMarket {
  question: string;
  variable_type: VariableType;
  outcomes: GeneratedOutcome[];
}

// ---- helpers ---------------------------------------------------------------

/** Narrowing helper for the resolve path. The `variable_type` column
 *  is the source of truth at runtime; this just casts the JSONB. */
export function isPlacementSpec(
  spec: unknown,
): spec is PlacementOutcomeSpec {
  return (
    !!spec &&
    typeof spec === "object" &&
    (spec as { type?: unknown }).type === "placement" &&
    Array.isArray((spec as PlacementOutcomeSpec).thresholds)
  );
}

export function isBinarySpec(spec: unknown): spec is BinaryOutcomeSpec {
  return (
    !!spec &&
    typeof spec === "object" &&
    (spec as { type?: unknown }).type === "binary" &&
    Array.isArray((spec as BinaryOutcomeSpec).options) &&
    (spec as BinaryOutcomeSpec).options.length === 2
  );
}

export function isPickoneSpec(spec: unknown): spec is PickoneOutcomeSpec {
  return (
    !!spec &&
    typeof spec === "object" &&
    (spec as { type?: unknown }).type === "pickone" &&
    Array.isArray((spec as PickoneOutcomeSpec).options)
  );
}

export function isCountSpec(spec: unknown): spec is CountOutcomeSpec {
  return (
    !!spec &&
    typeof spec === "object" &&
    (spec as { type?: unknown }).type === "count" &&
    typeof (spec as CountOutcomeSpec).threshold === "number"
  );
}
