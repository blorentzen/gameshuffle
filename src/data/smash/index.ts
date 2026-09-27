import { SMASH_CARDS } from "@/data/smash/cards";
import { ULTIMATE } from "@/data/smash/ultimate";
import type { SmashGame } from "@/lib/smash/types";

export const SMASH_GAMES: Record<string, SmashGame> = { [ULTIMATE.slug]: ULTIMATE };
export function smashGame(slug: string | null | undefined): SmashGame | null {
  return (slug && SMASH_GAMES[slug]) || null;
}

/** Label/value rows for a saved Smash setup (setup cards, profile, share page). */
export function describeSmashSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  const game = smashGame(cfg.gameSlug as string);
  if (!game) return [];
  const rows: { label: string; value: string }[] = [];
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; fighter?: string }[]) : [];
  if (players.some((p) => p.fighter)) {
    rows.push({ label: "Fighters", value: players.map((p) => `${p.name ?? "Player"}${p.fighter ? ` (${p.fighter})` : ""}`).join(", ") });
  }
  const stage = cfg.stage as { stageId?: string } | null;
  const row = game.stages.find((s) => s.id === stage?.stageId);
  if (row) rows.push({ label: "Stage", value: row.name });
  rows.push({ label: "Rules", value: cfg.preset === "competitive" ? "Competitive" : "Party" });
  const squads = Array.isArray(cfg.squads) ? cfg.squads : [];
  if (squads.length) rows.push({ label: "Squad Strike", value: `${squads.length} squads of ${(squads[0] as string[]).length}` });
  const titles = (list: unknown) => (Array.isArray(list) ? list : [])
    .map((d: { id?: string }) => SMASH_CARDS.find((c) => c.id === d?.id)?.title).filter(Boolean);
  const rules = titles(cfg.rulesCards);
  if (rules.length) rows.push({ label: "House rules", value: rules.join(", ") });
  const chance = titles(cfg.chance);
  if (chance.length) rows.push({ label: "Chance cards", value: chance.join(", ") });
  const missions = Array.isArray(cfg.missions) ? (cfg.missions as unknown[][]).reduce((n, h) => n + (Array.isArray(h) ? h.length : 0), 0) : 0;
  if (missions) rows.push({ label: "Missions", value: `${missions} dealt` });
  return rows;
}
