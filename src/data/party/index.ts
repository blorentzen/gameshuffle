import type { PartyGame } from "@/lib/party/types";
import { JAMBOREE } from "@/data/party/jamboree";
import { PARTY_CARDS } from "@/data/party/cards";

/** Every Mario Party game on the shared engine, by slug. Add new entries here. */
export const PARTY_GAMES: Record<string, PartyGame> = {
  [JAMBOREE.slug]: JAMBOREE,
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
  const ruleIds = Array.isArray(cfg.ruleCardIds) ? (cfg.ruleCardIds as string[]) : [];
  const titles = ruleIds.map((id) => PARTY_CARDS.find((c) => c.id === id)?.title).filter(Boolean);
  if (titles.length) rows.push({ label: "House rules", value: titles.join(", ") });
  return rows;
}
