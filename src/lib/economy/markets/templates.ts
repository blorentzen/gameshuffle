/**
 * Market template engine.
 *
 * The system authors every market — never a user. `!gs market open`
 * draws a random eligible template for the current `(game_key,
 * chapter)`, renders the question, generates the outcome rows. This
 * file is the registry of "what's eligible" + "how to render and
 * generate outcomes for each variable_type."
 *
 * Adding a new template = INSERT into `gs_market_templates`. Adding
 * a new variable_type = add a branch in `generateOutcomesFromSpec`
 * + a branch in the resolve path.
 *
 * Per `specs/gs-token-economy/02-prediction-market.md` §4.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  isBinarySpec,
  isCountSpec,
  isPickoneSpec,
  isPlacementSpec,
  type GeneratedOutcome,
  type OutcomeSpec,
  type RenderedMarket,
  type VariableType,
} from "./types";

interface TemplateRow {
  id: string;
  variable_type: VariableType;
  question_tmpl: string;
  outcome_spec: OutcomeSpec;
}

/**
 * Pick a random enabled template that's eligible for the given game.
 * Eligibility = the template's `variable_type` appears in the game's
 * `gs_game_variable_map` row. A game with no rows in the map gets
 * no markets (intentional — Spec 02 §4 appendix).
 *
 * Returns null when no eligible templates exist, which the caller
 * surfaces as "this game doesn't support markets yet."
 */
export async function pickEligibleTemplate(
  gameKey: string,
): Promise<TemplateRow | null> {
  const admin = createServiceClient();

  // Two reads, one for game's allowed variables and one for the
  // template pool. Could be a single join via PostgREST embed but
  // the two-query path is easier to read and the volumes are tiny.
  const { data: variables } = await admin
    .from("gs_game_variable_map")
    .select("variable_type")
    .eq("game_key", gameKey);
  const allowed = ((variables as Array<{ variable_type: string }> | null) ?? [])
    .map((r) => r.variable_type);
  if (allowed.length === 0) return null;

  const { data: templates } = await admin
    .from("gs_market_templates")
    .select("id, variable_type, question_tmpl, outcome_spec")
    .eq("enabled", true)
    .in("variable_type", allowed);
  const pool = (templates as TemplateRow[] | null) ?? [];
  if (pool.length === 0) return null;

  // Random draw — per README's open-tuning calls, defaulting to
  // random (vs. sequential cycling). Easy to flip later.
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Render a chosen template into a ready-to-insert market shape:
 * the substituted question + generated outcomes.
 *
 * `subject` is the rendered display name for the player the market
 * is about. Phase 1 = the session owner (streamer); Phase 2+ can
 * expand to named resolvers (per the spec's deferred concept).
 */
export function renderTemplate(
  template: Pick<TemplateRow, "question_tmpl" | "outcome_spec" | "variable_type">,
  subject: string,
): RenderedMarket {
  return {
    variable_type: template.variable_type,
    question: substitute(template.question_tmpl, { subject }),
    outcomes: generateOutcomesFromSpec(template.outcome_spec),
  };
}

/** {placeholder} substitution. Unknown placeholders pass through
 *  unchanged so they're easy to spot at QA time. */
function substitute(
  tmpl: string,
  vars: Record<string, string | number | undefined>,
): string {
  return tmpl.replace(/\{(\w+)\}/g, (full, name: string) => {
    const v = vars[name];
    return v === undefined ? full : String(v);
  });
}

/**
 * Generate the outcome rows for a market given the template's
 * outcome_spec. Branches per variable_type — each variant has its
 * own structural shape (see ./types.ts for the conventions).
 */
export function generateOutcomesFromSpec(
  spec: OutcomeSpec,
): GeneratedOutcome[] {
  if (isPlacementSpec(spec)) {
    return spec.thresholds.map((t) => ({
      option_key: t.key,
      label: t.label,
    }));
  }
  if (isBinarySpec(spec)) {
    return spec.options.map((o) => ({
      option_key: o.key,
      label: o.label,
    }));
  }
  if (isPickoneSpec(spec)) {
    return spec.options.map((o) => ({
      option_key: o.key,
      label: o.label,
    }));
  }
  if (isCountSpec(spec)) {
    return [
      { option_key: "over", label: `Over ${spec.threshold}` },
      { option_key: "under", label: `Under ${spec.threshold}` },
    ];
  }
  throw new Error(
    `generateOutcomesFromSpec: unknown spec shape ${JSON.stringify(spec)}`,
  );
}
