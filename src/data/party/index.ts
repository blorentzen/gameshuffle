import type { PartyGame } from "@/lib/party/types";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";
import { PARTY_CARDS } from "@/data/party/cards";

/** The card-deck family every Mario Party game shares (meta_decks.family). */
export const PARTY_FAMILY = "mario-party";

/** Every Mario Party game on the shared engine, by slug. Add new entries here. */
export const PARTY_GAMES: Record<string, PartyGame> = {
  [JAMBOREE.slug]: JAMBOREE,
  [SUPERSTARS.slug]: SUPERSTARS,
};

export function partyGame(slug: string | null | undefined): PartyGame | null {
  return (slug && PARTY_GAMES[slug]) || null;
}

/**
 * Label/value rows describing a saved party setup, for the account card,
 * profile and share page. Tolerates partial or older data.
 */
export function describePartySetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  const game = partyGame(cfg.gameSlug as string);
  if (!game) return [];
  const rows: { label: string; value: string }[] = [];
  const setup = cfg.setup as { boardId?: string; rulesetId?: string; turns?: number; bonusModeId?: string } | null;
  const edition = game.editions?.find((e) => e.id === cfg.edition);
  if (edition) rows.push({ label: "Version", value: edition.label });
  if (setup) {
    const board = game.boards.find((b) => b.id === setup.boardId);
    const ruleset = game.rulesets.find((r) => r.id === setup.rulesetId);
    const bonus = game.bonusModes.find((m) => m.id === setup.bonusModeId);
    if (board) rows.push({ label: "Board", value: board.name });
    if (ruleset) rows.push({ label: "Rules", value: `${ruleset.label}, ${setup.turns} turns` });
    if (bonus) rows.push({ label: "Bonus Stars", value: bonus.label });
  }
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; character?: string }[]) : [];
  if (players.some((p) => p.character)) {
    rows.push({ label: "Players", value: players.map((p) => `${p.name ?? "Player"}${p.character ? ` (${p.character})` : ""}`).join(", ") });
  }
  const gauntlet = Array.isArray(cfg.gauntlet) ? (cfg.gauntlet as string[]) : [];
  if (gauntlet.length) rows.push({ label: "Minigames", value: `${gauntlet.length} in the set list` });
  const titles = (list: unknown) => (Array.isArray(list) ? list : [])
    .map((d: { id?: string }) => PARTY_CARDS.find((c) => c.id === d?.id)?.title).filter(Boolean);
  const rules = titles(cfg.rules);
  if (rules.length) rows.push({ label: "House rules", value: rules.join(", ") });
  const chance = titles(cfg.chance);
  if (chance.length) rows.push({ label: "Chance cards", value: chance.join(", ") });
  return rows;
}
