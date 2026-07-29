/**
 * Shared types + constants for the Platform Events editor — used by the tab
 * shell (PlatformEventsTab), the editor modal (EventEditorModal), and the
 * deck-EV helpers (deckStats). One source of truth for the event/consequence
 * shapes so they can't drift across the split files.
 */

import { type ChatAuthority } from "@/lib/twitch/commands/authority";

export interface FlavorVariable {
  name: string;
  description: string;
  example: string;
}

export type Surface = "chaos" | "random" | "both";
export type PartnerMode =
  | "none"
  | "mention"
  | "random_active"
  | "random_n"
  | "all_active";
export type ConsequenceTarget = "actor" | "partner" | "both";
export type EventAuthority = ChatAuthority;

export const FANOUT_MODES = new Set<PartnerMode>(["random_n", "all_active"]);

export interface ConsequenceRow {
  id: string;
  event_id: string;
  ctype: "token_delta" | "modifier" | "challenge" | "story";
  payload: Record<string, unknown>;
  target: ConsequenceTarget;
}

export interface EventRow {
  id: string;
  event_key: string;
  surface: Surface;
  flavor_tmpl: string;
  weight: number;
  game_scope: string | null;
  enabled: boolean;
  partner_mode: PartnerMode;
  partner_count: number | null;
  trigger_directly: boolean;
  min_authority: EventAuthority;
  created_at: string;
  consequences: ConsequenceRow[];
}

/** The consequence type union — one shared alias (was duplicated as `Ctype`
 *  and `EvCtype` across the original monolith). */
export type Ctype = ConsequenceRow["ctype"];

export const SURFACE_FILTERS: Array<{ value: "all" | Surface; label: string }> = [
  { value: "all", label: "All surfaces" },
  { value: "chaos", label: "Chaos only" },
  { value: "random", label: "Random only" },
  { value: "both", label: "Chaos + Random" },
];

export const SURFACE_LABEL: Record<Surface, string> = {
  chaos: "Chaos",
  random: "Random",
  both: "Both",
};

export const CTYPE_SHORT: Record<Ctype, string> = {
  token_delta: "token",
  modifier: "mod",
  challenge: "challenge",
  story: "story",
};

export const CTYPE_LABEL: Record<Ctype, string> = {
  token_delta: "Token delta",
  modifier: "Modifier",
  challenge: "Challenge",
  story: "Story beat",
};

export const TARGET_LABEL: Record<ConsequenceTarget, string> = {
  actor: "actor",
  partner: "partner",
  both: "both",
};
