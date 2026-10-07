import { SPLATOON3 } from "@/data/splatoon/splatoon3";
import type { SplatoonGame } from "@/lib/splatoon/types";

export const SPLATOON_GAMES: Record<string, SplatoonGame> = { [SPLATOON3.slug]: SPLATOON3 };
export function splatoonGame(slug: string | null | undefined): SplatoonGame | null {
  return (slug && SPLATOON_GAMES[slug]) || null;
}

/** Label/value rows for a saved Splatoon setup (setup cards, profile, share page). */
export function describeSplatoonSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  const game = splatoonGame(cfg.gameSlug as string);
  if (!game) return [];
  const rows: { label: string; value: string }[] = [];
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; weapon?: string }[]) : [];
  if (players.some((p) => p.weapon)) {
    rows.push({ label: "Weapons", value: players.map((p) => `${p.name ?? "Player"}${p.weapon ? ` (${p.weapon})` : ""}`).join(", ") });
  }
  const battles = Array.isArray(cfg.battles) ? (cfg.battles as { modeId?: string; stage?: string }[]) : [];
  if (battles.length) {
    rows.push({ label: battles.length > 1 ? "Battles" : "Battle", value: battles.map((b) => `${game.modes.find((m) => m.id === b.modeId)?.name ?? "Battle"} on ${b.stage}`).join("; ") });
  }
  if (typeof cfg.salmon === "string" && cfg.salmon) rows.push({ label: "Salmon Run", value: cfg.salmon });
  const teams = cfg.teams as { alpha?: string[]; bravo?: string[] } | null;
  if (teams?.alpha?.length) rows.push({ label: "Teams", value: `Alpha: ${teams.alpha.join(", ")} · Bravo: ${(teams.bravo ?? []).join(", ")}` });
  return rows;
}
